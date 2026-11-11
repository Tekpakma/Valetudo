const assert = require("node:assert");
const { describe, it, beforeEach } = require("node:test");

const DreameMapAnnotationsCapability = require("../../../../../lib/robots/dreame/capabilities/DreameMapAnnotationsCapability");

const AREA = [
    {x: 3265, y: 3435},
    {x: 3363, y: 3435},
    {x: 3363, y: 3478},
    {x: 3265, y: 3478}
];
const SUCCESS_RESPONSE = {siid: 6, aiid: 2, code: 0, out: [{piid: 6, value: 0}]};

describe("DreameMapAnnotationsCapability", () => {
    let calls;
    let robot;
    let capability;

    const setResponse = (response) => {
        robot.sendCommand = async (method, args) => {
            calls.push({method: method, args: args});

            return response;
        };
    };

    beforeEach(() => {
        calls = [];
        robot = {
            deviceId: 123,
            state: {
                map: {
                    entities: [],
                    metaData: {
                        dreameLowClearanceEditable: true,
                        dreameVws: {
                            vwsl: [],
                            npthrsd: [[1, 2, 3, 4]],
                            ramp: []
                        }
                    }
                }
            },
            pollMap: () => {
                calls.push("poll");
            }
        };
        setResponse(SUCCESS_RESPONSE);

        capability = new DreameMapAnnotationsCapability({
            robot: robot,
            supportedAnnotationTypes: ["threshold", "curtain", "ramp"],
            lowClearanceSupported: true,
            incrementalUpdates: true,
            miot_actions: {
                map_edit: {
                    siid: 6,
                    aiid: 2
                }
            },
            miot_properties: {
                mapDetails: {
                    piid: 4
                },
                actionResult: {
                    piid: 6
                }
            }
        });
    });

    it("sends low-clearance areas without touching other map annotations", async () => {
        await capability.setLowClearanceAreas([AREA], []);

        assert.deepStrictEqual(calls[0], {
            method: "action",
            args: {
                did: 123,
                siid: 6,
                aiid: 2,
                in: [
                    {
                        piid: 4,
                        value: "{\"asa\":[[-118,-1578,862,-1578,862,-2008,-118,-2008]]}"
                    }
                ]
            }
        });
        assert.strictEqual(calls[1], "poll");
    });

    it("sends unchanged low-clearance areas back with their original firmware coordinates", async () => {
        const roi = [-117, -1579, 861, -1579, 861, -2009, -117, -2009];
        robot.state.map.entities = [
            {
                type: "low_clearance",
                points: AREA.flatMap(p => [p.x, p.y]),
                metaData: {
                    manual: true,
                    dreameRoi: roi
                }
            }
        ];

        await capability.setLowClearanceAreas([AREA], [AREA]);

        assert.deepStrictEqual(JSON.parse(calls[0].args.in[0].value).asa, [roi]);
    });

    it("refuses to overwrite low-clearance areas added after editing began", async () => {
        robot.state.map.entities = [
            {
                type: "low_clearance",
                points: AREA.flatMap(p => [p.x, p.y]),
                metaData: {
                    manual: true
                }
            }
        ];

        await assert.rejects(capability.setLowClearanceAreas([], []), /changed since editing began/);
        assert.strictEqual(calls.length, 0);
    });

    it("rejects malformed low-clearance areas and firmware errors", async () => {
        setResponse({siid: 6, aiid: 2, out: [{piid: 6, value: 1}]});

        await assert.rejects(capability.setLowClearanceAreas([[{x: 0, y: 0}]], []));
        assert.strictEqual(calls.length, 0);

        await assert.rejects(capability.setLowClearanceAreas([AREA], []));
        assert.strictEqual(calls.length, 1);
    });

    it("does not edit anything without complete map data", async () => {
        robot.state.map.metaData = {};
        capability.supportedAnnotationTypes = ["threshold"];

        await assert.rejects(capability.setLowClearanceAreas([AREA], []));
        await assert.rejects(capability.setMapAnnotations([]));
        assert.strictEqual(calls.length, 0);
    });

    it("clears thresholds without resending an unchanged curtain or losing impassable thresholds", async () => {
        robot.state.map.metaData.dreameVws.vwsl = [[1504, -2159, 1556, -57, 0]];
        robot.state.map.entities = [
            {
                type: "curtain",
                points: [3385, 3435, 3385, 3475]
            }
        ];

        await capability.setMapAnnotations([
            {type: "curtain", points: [{x: 3385, y: 3435}, {x: 3385, y: 3475}]}
        ]);

        assert.strictEqual(calls.length, 2);

        const payload = JSON.parse(calls[0].args.in[0].value);
        assert.deepStrictEqual(payload.vws, {vwsl: [], npthrsd: [[1, 2, 3, 4]], ramp: []});
        assert.strictEqual(payload.curtain, undefined);
        assert.strictEqual(calls[1], "poll");
    });

    it("does not resend an unchanged curtain whose coordinates fall between map pixels", async () => {
        robot.state.map.pixelSize = 5;
        robot.state.map.metaData.dreameVws.vwsl = [[1504, -2159, 1556, -57, 0]];
        robot.state.map.entities = [
            {
                type: "curtain",
                points: [3387, 3437, 3388, 3478]
            }
        ];

        await capability.setMapAnnotations([
            {type: "curtain", points: [{x: 3385, y: 3435}, {x: 3385, y: 3475}]}
        ]);

        assert.strictEqual(calls.length, 2);
        assert.ok(JSON.parse(calls[0].args.in[0].value).vws);
        assert.strictEqual(calls[1], "poll");
    });

    it("does not resend an unchanged threshold whose coordinates fall between map pixels", async () => {
        robot.state.map.pixelSize = 5;
        robot.state.map.metaData.dreameVws.vwsl = [[1504, -2159, 1556, -57, 0]];

        await capability.setMapAnnotations([
            {type: "threshold", points: [{x: 3425, y: 3490}, {x: 3430, y: 3280}]}
        ]);

        assert.deepStrictEqual(calls, ["poll"]);
    });

    it("waits for the threshold change to be applied before sending a changed curtain", async () => {
        robot.state.map.metaData.dreameVws.vwsl = [[1504, -2159, 1556, -57, 0]];
        robot.pollMap = () => {
            calls.push("poll");
            robot.state.map.metaData.dreameVws.vwsl = [];
        };

        await capability.setMapAnnotations([
            {type: "curtain", points: [{x: 3385, y: 3435}, {x: 3385, y: 3475}]}
        ]);

        assert.ok(JSON.parse(calls[0].args.in[0].value).vws);
        assert.strictEqual(calls[1], "poll");
        assert.ok(JSON.parse(calls[2].args.in[0].value).curtain);
        assert.strictEqual(calls[3], "poll");
    });
});
