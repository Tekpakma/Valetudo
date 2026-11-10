const assert = require("node:assert/strict");
const Capability = require("../lib/robots/dreame/capabilities/DreameMapAnnotationsCapability");
const {test} = require("node:test");

const area = [{x: 3265, y: 3435}, {x: 3363, y: 3435}, {x: 3363, y: 3478}, {x: 3265, y: 3478}];

function setup(response) {
    const calls = [];
    const robot = {
        deviceId: 123,
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
    await capability.setLowClearanceAreas([area]);
    assert.deepEqual(calls[0], {method: "action", args: {did: 123, siid: 6, aiid: 2,
        in: [{piid: 4, value: '{"asa":[[-118,-1578,862,-1578,862,-2008,-118,-2008]]}'}]}});
    assert.equal(calls[1], "poll");
});

test("rejects malformed inputs and unexpected firmware responses", async () => {
    const {calls, capability} = setup({siid: 6, aiid: 2, out: [{piid: 6, value: 1}]});
    await assert.rejects(capability.setLowClearanceAreas([[{x: 0, y: 0}]]));
    assert.equal(calls.length, 0);
    await assert.rejects(capability.setLowClearanceAreas([area]));
    assert.equal(calls.length, 1);
});
