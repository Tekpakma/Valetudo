const DreameMapParser = require("../DreameMapParser");
const MapAnnotationsCapability = require("../../../core/capabilities/MapAnnotationsCapability");
const RobotFirmwareError = require("../../../core/RobotFirmwareError");
const ValetudoMapAnnotation = require("../../../entities/core/ValetudoMapAnnotation");
const {sleep} = require("../../../utils/misc");

/**
 * @extends MapAnnotationsCapability<import("../DreameValetudoRobot")>
 */
class DreameMapAnnotationsCapability extends MapAnnotationsCapability {
    /**
     *
     * @param {object} options
     * @param {import("../DreameValetudoRobot")} options.robot
     * @param {Array<import("../../../entities/core/ValetudoMapAnnotation").ValetudoMapAnnotationType>} options.supportedAnnotationTypes
     * @param {boolean} [options.lowClearanceSupported]
     *
     * @param {object} options.miot_actions
     * @param {object} options.miot_actions.map_edit
     * @param {number} options.miot_actions.map_edit.siid
     * @param {number} options.miot_actions.map_edit.aiid
     *
     * @param {object} options.miot_properties
     * @param {object} options.miot_properties.mapDetails
     * @param {number} options.miot_properties.mapDetails.piid
     *
     * @param {object} options.miot_properties.actionResult
     * @param {number} options.miot_properties.actionResult.piid
     */
    constructor(options) {
        super(options);

        this.miot_actions = options.miot_actions;
        this.miot_properties = options.miot_properties;
        this.lowClearanceSupported = options.lowClearanceSupported === true;
    }

    getProperties() {
        return {...super.getProperties(), lowClearanceSupported: this.lowClearanceSupported};
    }

    /**
     *
     * @param {Array<ValetudoMapAnnotation>} mapAnnotations
     * @returns {Promise<void>}
     */
    async setMapAnnotations(mapAnnotations) {
        const dreamePayload = {};

        for (const type of this.supportedAnnotationTypes) {
            switch (type) {
                case ValetudoMapAnnotation.TYPE.THRESHOLD: {
                    if (dreamePayload.vws === undefined) {
                        dreamePayload.vws = {};
                    }
                    dreamePayload.vws.vwsl = [];

                    for (const annotation of mapAnnotations.filter(e => e.type === type)) {
                        const pA = DreameMapParser.CONVERT_TO_DREAME_COORDINATES(annotation.points[0].x, annotation.points[0].y);
                        const pC = DreameMapParser.CONVERT_TO_DREAME_COORDINATES(annotation.points[1].x, annotation.points[1].y);

                        dreamePayload.vws.vwsl.push([
                            pA.x,
                            pA.y,
                            pC.x,
                            pC.y,
                        ]);
                    }

                    break;
                }

                case ValetudoMapAnnotation.TYPE.CURTAIN: {
                    if (dreamePayload.curtain === undefined) {
                        dreamePayload.curtain = {};
                    }
                    dreamePayload.curtain.line = [];

                    for (const annotation of mapAnnotations.filter(e => e.type === type)) {
                        const pA = DreameMapParser.CONVERT_TO_DREAME_COORDINATES(annotation.points[0].x, annotation.points[0].y);
                        const pC = DreameMapParser.CONVERT_TO_DREAME_COORDINATES(annotation.points[1].x, annotation.points[1].y);

                        dreamePayload.curtain.line.push([
                            pA.x,
                            pA.y,
                            pC.x,
                            pC.y,
                        ]);
                    }
                    break;
                }

                case ValetudoMapAnnotation.TYPE.RAMP: {
                    if (dreamePayload.vws === undefined) {
                        dreamePayload.vws = {};
                    }
                    dreamePayload.vws.ramp = [];

                    for (const annotation of mapAnnotations.filter(e => e.type === type)) {
                        const points = annotation.points;
                        const pA = points[0];
                        const pB = points[1];
                        const pC = points[2];
                        const pD = points[3];

                        const angleRad = Math.atan2(pB.y - pA.y, pB.x - pA.x);
                        const angleDegrees = angleRad * 180 / Math.PI;

                        const width = Math.hypot(pB.x - pA.x, pB.y - pA.y);
                        const height = Math.hypot(pD.x - pA.x, pD.y - pA.y);

                        const centerX = (pA.x + pC.x) / 2;
                        const centerY = (pA.y + pC.y) / 2;

                        const minX = centerX - (width / 2);
                        const maxX = centerX + (width / 2);
                        const minY = centerY - (height / 2);
                        const maxY = centerY + (height / 2);

                        const dreame_pA = DreameMapParser.CONVERT_TO_DREAME_COORDINATES(minX, minY);
                        const dreame_pB = DreameMapParser.CONVERT_TO_DREAME_COORDINATES(maxX, maxY);
                        dreamePayload.vws.ramp.push([
                            Math.min(Math.round(dreame_pA.x), Math.round(dreame_pB.x)),
                            Math.min(Math.round(dreame_pA.y), Math.round(dreame_pB.y)),
                            Math.max(Math.round(dreame_pA.x), Math.round(dreame_pB.x)),
                            Math.max(Math.round(dreame_pA.y), Math.round(dreame_pB.y)),

                            ((Math.round(-angleDegrees) % 360) + 360) % 360
                        ]);
                    }

                    break;
                }
            }
        }

        const payloads = [];
        let vwsWasApplied;
        if (this.lowClearanceSupported && dreamePayload.vws) {
            const existing = this.robot.state?.map?.metaData?.dreameVws;
            if (!existing || !Array.isArray(existing.vwsl) || !Array.isArray(existing.npthrsd) ||
                !Array.isArray(existing.ramp) || !Array.isArray(this.robot.state?.map?.entities) ||
                existing.vwsl.some(line => !Array.isArray(line) || line.length < 4 || !line.slice(0, 4).every(Number.isFinite)) ||
                existing.ramp.some(ramp => !Array.isArray(ramp) || ramp.length < 5 || !ramp.slice(0, 5).every(Number.isFinite))) {
                throw new Error("Cannot save thresholds without the current impassable threshold data");
            }
            // V50 firmware may report success while ignoring VWS when sent with curtains.
            // Keep the firmware's other VWS fields, including non-passable thresholds.
            const normalize = (lines, withAngle = false) => lines.map(line => {
                const a = DreameMapParser.CONVERT_TO_VALETUDO_COORDINATES(line[0], line[1]);
                const b = DreameMapParser.CONVERT_TO_VALETUDO_COORDINATES(line[2], line[3]);
                return JSON.stringify([a.x, a.y, b.x, b.y, ...(withAngle ? [line[4]] : [])]);
            }).sort();
            const differs = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
            const vwsChanged = differs(normalize(existing.vwsl), normalize(dreamePayload.vws.vwsl ?? [])) ||
                differs(normalize(existing.ramp, true), normalize(dreamePayload.vws.ramp ?? [], true));
            const currentCurtains = this.robot.state.map.entities.filter(e => e.type === "curtain")
                .map(e => JSON.stringify(e.points.slice(0, 4))).sort();
            const curtainChanged = dreamePayload.curtain &&
                differs(currentCurtains, normalize(dreamePayload.curtain.line));
            if (vwsChanged) {
                payloads.push({vws: {...existing, ...dreamePayload.vws}});
            }
            if (curtainChanged) {
                payloads.push({curtain: dreamePayload.curtain});
            }
            if (vwsChanged && curtainChanged) {
                const expectedLines = normalize(dreamePayload.vws.vwsl ?? []);
                const expectedRamps = normalize(dreamePayload.vws.ramp ?? [], true);
                vwsWasApplied = () => {
                    const current = this.robot.state?.map?.metaData?.dreameVws;
                    return current && Array.isArray(current.vwsl) && Array.isArray(current.ramp) &&
                        !differs(normalize(current.vwsl), expectedLines) &&
                        !differs(normalize(current.ramp, true), expectedRamps);
                };
            }
        } else {
            payloads.push(dreamePayload);
        }

        for (const payload of payloads) {
            const res = await this.robot.sendCommand("action", {
                did: this.robot.deviceId,
                siid: this.miot_actions.map_edit.siid,
                aiid: this.miot_actions.map_edit.aiid,
                in: [{piid: this.miot_properties.mapDetails.piid, value: JSON.stringify(payload)}]
            });
            if (!res || (res.code !== undefined && res.code !== 0) || res.siid !== this.miot_actions.map_edit.siid ||
                res.aiid !== this.miot_actions.map_edit.aiid || !Array.isArray(res.out) ||
                res.out.length !== 1 || res.out[0].piid !== this.miot_properties.actionResult.piid) {
                throw new RobotFirmwareError("Unrecognized firmware response while saving map annotations");
            }
            if (res.out[0].value !== 0) {
                throw new RobotFirmwareError("Got error " + res.out[0].value + " while saving map annotations");
            }
            if (payload.vws && vwsWasApplied) {
                this.robot.pollMap();
                for (let attempt = 0; attempt < 30 && !vwsWasApplied(); attempt++) {
                    await sleep(500);
                }
                if (!vwsWasApplied()) {
                    throw new RobotFirmwareError("Threshold update could not be verified; curtain changes were not sent. Refresh the map and retry.");
                }
            }
        }
        this.robot.pollMap();
    }

    /**
     * Replace the complete set of manual low-clearance polygons.
     * @param {Array<Array<{x: number, y: number}>>} areas
     * @param {Array<Array<{x: number, y: number}>>} expectedAreas
     * @returns {Promise<void>}
     */
    async setLowClearanceAreas(areas, expectedAreas) {
        if (!this.lowClearanceSupported) {
            throw new Error("Low-clearance editing is not enabled for this robot");
        }
        if (this.robot.state?.map?.metaData?.dreameLowClearanceEditable !== true) {
            throw new Error("Cannot safely edit low-clearance areas until the complete saved area list is available");
        }
        const validAreas = list => Array.isArray(list) && !list.some(area =>
            !Array.isArray(area) || area.length !== 4 || area.some(point =>
                !point || !Number.isInteger(point.x) || !Number.isInteger(point.y) ||
                point.x < 0 || point.x > 6553 || point.y < 0 || point.y > 6553
            )
        );
        if (!validAreas(areas) || !validAreas(expectedAreas)) {
            throw new Error("Each area must have four integer map-coordinate points");
        }
        if (!Array.isArray(this.robot.state.map.entities)) {
            throw new Error("Cannot safely edit low-clearance areas without map entities");
        }
        const currentEntities = this.robot.state.map.entities.filter(e => e.type === "low_clearance" && e.metaData?.manual === true);
        const current = currentEntities
            .map(e => [0, 2, 4, 6].map(i => ({x: e.points[i], y: e.points[i + 1]})));
        const normalize = list => list.map(a => JSON.stringify(a.map(p => [p.x, p.y]))).sort();
        if (!validAreas(current) || JSON.stringify(normalize(current)) !== JSON.stringify(normalize(expectedAreas))) {
            throw new Error("Low-clearance areas changed since editing began; refresh the map before saving");
        }
        const asa = areas.map(area => {
            const matchingIndex = current.findIndex(existing => JSON.stringify(existing) === JSON.stringify(area));
            const original = matchingIndex >= 0 ? currentEntities[matchingIndex].metaData?.dreameRoi : undefined;
            if (Array.isArray(original) && original.length === 8 && original.every(Number.isInteger)) {
                return original;
            }
            return area.flatMap(point => {
                const p = DreameMapParser.CONVERT_TO_DREAME_COORDINATES(point.x, point.y);
                if (p.x < -32768 || p.x > 32767 || p.y < -32768 || p.y > 32767) {
                    throw new Error("Converted coordinate outside firmware range");
                }
                return [p.x, p.y];
            });
        });
        const res = await this.robot.sendCommand("action", {
            did: this.robot.deviceId,
            siid: this.miot_actions.map_edit.siid,
            aiid: this.miot_actions.map_edit.aiid,
            in: [{piid: this.miot_properties.mapDetails.piid, value: JSON.stringify({asa: asa})}]
        });
        if (!res || (res.code !== undefined && res.code !== 0) || res.siid !== this.miot_actions.map_edit.siid ||
            res.aiid !== this.miot_actions.map_edit.aiid || !Array.isArray(res.out) ||
            res.out.length !== 1 || res.out[0].piid !== this.miot_properties.actionResult.piid) {
            throw new RobotFirmwareError("Unrecognized firmware response to low-clearance edit");
        }
        if (res.out[0].value !== 0) {
            throw new RobotFirmwareError("Firmware rejected low-clearance edit: " + res.out[0].value);
        }
        this.robot.pollMap();
    }
}

module.exports = DreameMapAnnotationsCapability;
