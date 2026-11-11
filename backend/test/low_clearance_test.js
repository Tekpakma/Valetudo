const assert = require("node:assert/strict");
const Capability = require("../lib/robots/dreame/capabilities/DreameMapAnnotationsCapability");
const DreameMapParser = require("../lib/robots/dreame/DreameMapParser");
const fs = require("node:fs");
const zlib = require("node:zlib");
const {test} = require("node:test");

const area = [{x: 3265, y: 3435}, {x: 3363, y: 3435}, {x: 3363, y: 3478}, {x: 3265, y: 3478}];

function setup(response) {
    const calls = [];
    const robot = {
        deviceId: 123,
        state: {map: {entities: [], metaData: {dreameLowClearanceEditable: true, dreameVws: {vwsl: [], npthrsd: [[1, 2, 3, 4]], ramp: []}}}},
        sendCommand: async function(method, args) {
            calls.push({method: method, args: args}); return response;
        },
        pollMap: function() {
            calls.push("poll");
        }
    };
    const capability = new Capability({robot: robot, supportedAnnotationTypes: [], lowClearanceSupported: true,
        miot_actions: {map_edit: {siid: 6, aiid: 2}},
        miot_properties: {mapDetails: {piid: 4}, actionResult: {piid: 6}}});
    return {calls: calls, capability: capability};
}

test("encodes a low-clearance polygon without modifying other map annotations", async () => {
    const {calls, capability} = setup({siid: 6, aiid: 2, out: [{piid: 6, value: 0}]});
    await capability.setLowClearanceAreas([area], []);
    assert.deepEqual(calls[0], {method: "action", args: {did: 123, siid: 6, aiid: 2,
        in: [{piid: 4, value: '{"asa":[[-118,-1578,862,-1578,862,-2008,-118,-2008]]}'}]}});
    assert.equal(calls[1], "poll");
});

test("clears thresholds without resending an unchanged curtain or losing other thresholds", async () => {
    const {calls, capability} = setup({siid: 6, aiid: 2, code: 0, out: [{piid: 6, value: 0}]});
    capability.supportedAnnotationTypes = ["threshold", "curtain", "ramp"];
    capability.robot.state.map.metaData.dreameVws.vwsl = [[1504, -2159, 1556, -57, 0]];
    capability.robot.state.map.entities = [{type: "curtain", points: [3385, 3435, 3385, 3475]}];
    await capability.setMapAnnotations([{type: "curtain", points: [{x: 3385, y: 3435}, {x: 3385, y: 3475}]}]);
    assert.equal(calls.length, 2);
    const first = JSON.parse(calls[0].args.in[0].value);
    assert.deepEqual(first.vws, {vwsl: [], npthrsd: [[1, 2, 3, 4]], ramp: []});
    assert.equal(first.curtain, undefined);
    assert.equal(calls[1], "poll");
});

test("waits for the threshold update before sending a changed curtain", async () => {
    const {calls, capability} = setup({siid: 6, aiid: 2, code: 0, out: [{piid: 6, value: 0}]});
    capability.supportedAnnotationTypes = ["threshold", "curtain", "ramp"];
    capability.robot.state.map.metaData.dreameVws.vwsl = [[1504, -2159, 1556, -57, 0]];
    capability.robot.pollMap = function() {
        calls.push("poll");
        capability.robot.state.map.metaData.dreameVws.vwsl = [];
    };
    await capability.setMapAnnotations([
        {type: "curtain", points: [{x: 3385, y: 3435}, {x: 3385, y: 3475}]}
    ]);
    assert.ok(JSON.parse(calls[0].args.in[0].value).vws);
    assert.equal(calls[1], "poll");
    assert.ok(JSON.parse(calls[2].args.in[0].value).curtain);
    assert.equal(calls[3], "poll");
});

test("does not edit areas or thresholds without complete map data", async () => {
    const {calls, capability} = setup({siid: 6, aiid: 2, out: [{piid: 6, value: 0}]});
    capability.robot.state.map.metaData = {};
    capability.supportedAnnotationTypes = ["threshold"];
    await assert.rejects(capability.setLowClearanceAreas([area], []));
    await assert.rejects(capability.setMapAnnotations([]));
    assert.equal(calls.length, 0);
});

test("rejects malformed inputs and unexpected firmware responses", async () => {
    const {calls, capability} = setup({siid: 6, aiid: 2, out: [{piid: 6, value: 1}]});
    await assert.rejects(capability.setLowClearanceAreas([[{x: 0, y: 0}]], []));
    assert.equal(calls.length, 0);
    await assert.rejects(capability.setLowClearanceAreas([area], []));
    assert.equal(calls.length, 1);
});

test("rejects overwriting a manual area added after the editor opened", async () => {
    const {calls, capability} = setup({siid: 6, aiid: 2, out: [{piid: 6, value: 0}]});
    capability.robot.state.map.entities = [{type: "low_clearance", metaData: {manual: true},
        points: area.flatMap(p => [p.x, p.y])}];
    await assert.rejects(capability.setLowClearanceAreas([], []), /changed since editing began/);
    assert.equal(calls.length, 0);
});

test("preserves exact firmware coordinates of an unchanged area", async () => {
    const {calls, capability} = setup({siid: 6, aiid: 2, out: [{piid: 6, value: 0}]});
    const raw = [-117, -1579, 861, -1579, 861, -2009, -117, -2009];
    capability.robot.state.map.entities = [{type: "low_clearance", metaData: {manual: true, dreameRoi: raw},
        points: area.flatMap(p => [p.x, p.y])}];
    await capability.setLowClearanceAreas([area], [area]);
    assert.deepEqual(JSON.parse(calls[0].args.in[0].value).asa, [raw]);
});

test("reads manual and automatic low-clearance areas from the saved map", async () => {
    const raw = fs.readFileSync(__dirname + "/lib/robots/dreame/res/map/d9_1058_no_segments.bin");
    const end = 27 + raw.readInt16LE(19) * raw.readInt16LE(21);
    const frame = data => Buffer.concat([raw.subarray(0, end), Buffer.from(JSON.stringify(data))]);
    const roi = [-118, -1578, 862, -1578, 862, -2008, -118, -2008];
    const saved = frame({sneak_areas: [{id: 1, type: 0, roi: roi}, {id: 2, type: 1, roi: roi}],
        vws: {vwsl: [], npthrsd: [], ramp: []}});
    const outer = frame({ris: 2, rism: zlib.deflateSync(saved).toString("base64")});
    const map = await DreameMapParser.PARSE(outer);
    const areas = map.entities.filter(e => e.type === "low_clearance");
    assert.equal(map.metaData.dreameLowClearanceEditable, true);
    assert.deepEqual(map.metaData.dreameVws, {vwsl: [], npthrsd: [], ramp: []});
    assert.equal(areas.length, 2);
    assert.equal(areas[0].metaData.manual, false);
    assert.equal(areas[1].metaData.manual, true);
    assert.deepEqual(areas[1].points, [3265, 3435, 3363, 3435, 3363, 3478, 3265, 3478]);
});

test("disables editing when a hidden manual area cannot be preserved", async () => {
    const raw = fs.readFileSync(__dirname + "/lib/robots/dreame/res/map/d9_1058_no_segments.bin");
    const end = 27 + raw.readInt16LE(19) * raw.readInt16LE(21);
    const data = {sneak_areas: [{id: 1, type: 1, hide: true, roi: [-118, -1578, 862, -1578, 862, -2008, -118, -2008]}]};
    const map = await DreameMapParser.PARSE(Buffer.concat([raw.subarray(0, end), Buffer.from(JSON.stringify(data))]));
    assert.equal(map.metaData.dreameLowClearanceEditable, false);
    assert.equal(map.entities.filter(e => e.type === "low_clearance").length, 0);
});
