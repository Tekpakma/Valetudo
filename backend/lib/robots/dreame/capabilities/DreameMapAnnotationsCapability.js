const DreameMapParser = require("../DreameMapParser");
const MapAnnotationsCapability = require("../../../core/capabilities/MapAnnotationsCapability");
const mapEntities = require("../../../entities/map");
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
     * @param {boolean} [options.incrementalUpdates] Only send annotations that actually changed. See setMapAnnotationsIncrementally()
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

        this.incrementalUpdates = options.incrementalUpdates ?? false;
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

        if (this.incrementalUpdates && dreamePayload.vws !== undefined) {
            await this.setMapAnnotationsIncrementally(dreamePayload);
        } else {
            await this.sendMapEdit(dreamePayload);
        }

        this.robot.pollMap();
    }

    /**
     * Some firmwares (e.g. the one of the Mova V50) report success but silently ignore vws changes if they
     * are sent together with curtains. Furthermore, sending vws replaces all of it, including parts not
     * managed by Valetudo such as impassable thresholds.
     *
     * Therefore, this only sends what actually changed, merges the vws changes into what is already on the robot
     * and waits for the vws change to be applied before sending curtain changes
     *
     * @private
     * @param {object} dreamePayload
     * @returns {Promise<void>}
     */
    async setMapAnnotationsIncrementally(dreamePayload) {
        const map = this.robot.state?.map;
        const currentVws = map?.metaData?.dreameVws;

        if (
            !currentVws ||
            !Array.isArray(currentVws.vwsl) ||
            !Array.isArray(currentVws.npthrsd) ||
            !Array.isArray(currentVws.ramp) ||
            !Array.isArray(map.entities) ||
            !currentVws.vwsl.every(line => {
                return isValidVwsEntry(line, 4);
            }) ||
            !currentVws.ramp.every(ramp => {
                return isValidVwsEntry(ramp, 5);
            })
        ) {
            throw new Error("Cannot save thresholds without the current impassable threshold data");
        }

        /*
            Annotations edited in the UI are snapped to the map pixel grid.
            To not detect changes where there are none, everything is compared on that grid
         */
        const pixelSize = map.pixelSize ?? 1;
        const snapToPixelGrid = (coordinate) => {
            return Math.floor(coordinate / pixelSize) * pixelSize;
        };
        const serializeLines = (lines, withAngle = false) => {
            return lines.map(line => {
                const pA = DreameMapParser.CONVERT_TO_VALETUDO_COORDINATES(line[0], line[1]);
                const pB = DreameMapParser.CONVERT_TO_VALETUDO_COORDINATES(line[2], line[3]);

                return JSON.stringify([
                    snapToPixelGrid(pA.x),
                    snapToPixelGrid(pA.y),
                    snapToPixelGrid(pB.x),
                    snapToPixelGrid(pB.y),

                    ...(withAngle ? [line[4]] : [])
                ]);
            }).sort();
        };

        const expectedLines = serializeLines(dreamePayload.vws.vwsl ?? []);
        const expectedRamps = serializeLines(dreamePayload.vws.ramp ?? [], true);
        const vwsMatchesExpectation = (vws) => {
            return (
                isEqual(serializeLines(vws.vwsl), expectedLines) &&
                isEqual(serializeLines(vws.ramp, true), expectedRamps)
            );
        };

        const vwsChanged = !vwsMatchesExpectation(currentVws);
        let curtainChanged = false;

        if (dreamePayload.curtain !== undefined) {
            const currentCurtains = map.entities.filter(e => {
                return e.type === mapEntities.LineMapEntity.TYPE.CURTAIN;
            }).map(e => {
                return JSON.stringify(e.points.slice(0, 4).map(snapToPixelGrid));
            }).sort();

            curtainChanged = !isEqual(currentCurtains, serializeLines(dreamePayload.curtain.line));
        }

        if (vwsChanged) {
            await this.sendMapEdit({
                vws: {
                    ...currentVws,
                    ...dreamePayload.vws
                }
            });

            if (curtainChanged) {
                const vwsWasApplied = () => {
                    const vws = this.robot.state?.map?.metaData?.dreameVws;

                    return (
                        !!vws &&
                        Array.isArray(vws.vwsl) &&
                        Array.isArray(vws.ramp) &&
                        vwsMatchesExpectation(vws)
                    );
                };

                this.robot.pollMap();

                for (let i = 0; i < 30 && !vwsWasApplied(); i++) {
                    await sleep(500);
                }

                if (!vwsWasApplied()) {
                    throw new RobotFirmwareError("Threshold update could not be verified; curtain changes were not sent. Refresh the map and retry.");
                }
            }
        }

        if (curtainChanged) {
            await this.sendMapEdit({
                curtain: dreamePayload.curtain
            });
        }
    }

    /**
     *
     * @param {Array<Array<{x: number, y: number}>>} areas
     * @param {Array<Array<{x: number, y: number}>>} expectedAreas
     * @returns {Promise<void>}
     */
    async setLowClearanceAreas(areas, expectedAreas) {
        if (!this.lowClearanceSupported) {
            throw new Error("This robot does not support low-clearance areas");
        }

        const map = this.robot.state?.map;

        if (map?.metaData?.dreameLowClearanceEditable !== true) {
            throw new Error("Cannot safely edit low-clearance areas until the complete saved area list is available");
        }

        if (!isValidAreaList(areas) || !isValidAreaList(expectedAreas)) {
            throw new Error("Each area must have four integer map-coordinate points");
        }

        if (!Array.isArray(map.entities)) {
            throw new Error("Cannot safely edit low-clearance areas without map entities");
        }

        const currentAreaEntities = map.entities.filter(e => {
            return e.type === mapEntities.PolygonMapEntity.TYPE.LOW_CLEARANCE && e.metaData?.manual === true;
        });
        const currentAreas = currentAreaEntities.map(e => {
            return [0, 2, 4, 6].map(i => {
                return {
                    x: e.points[i],
                    y: e.points[i + 1]
                };
            });
        });

        /*
            Edits always replace the full list of manual areas on the robot.
            If the list changed since the client started editing, we'd silently drop those changes
         */
        if (
            !isValidAreaList(currentAreas) ||
            !isEqual(serializeAreas(currentAreas), serializeAreas(expectedAreas))
        ) {
            throw new Error("Low-clearance areas changed since editing began; refresh the map before saving");
        }

        const dreameAreas = areas.map(area => {
            const currentAreaIndex = currentAreas.findIndex(currentArea => {
                return isEqual(currentArea, area);
            });
            const originalRoi = currentAreaIndex !== -1 ? currentAreaEntities[currentAreaIndex].metaData?.dreameRoi : undefined;

            // Unchanged areas are sent back exactly as they were received to not shift them due to rounding
            if (Array.isArray(originalRoi) && originalRoi.length === 8 && originalRoi.every(Number.isInteger)) {
                return originalRoi;
            }

            return area.flatMap(point => {
                const dreamePoint = DreameMapParser.CONVERT_TO_DREAME_COORDINATES(point.x, point.y);

                if (
                    dreamePoint.x < -DreameMapParser.HALF_INT16 || dreamePoint.x >= DreameMapParser.HALF_INT16 ||
                    dreamePoint.y < -DreameMapParser.HALF_INT16 || dreamePoint.y >= DreameMapParser.HALF_INT16
                ) {
                    throw new Error("Converted coordinate outside firmware range");
                }

                return [dreamePoint.x, dreamePoint.y];
            });
        });

        await this.sendMapEdit({
            asa: dreameAreas
        });

        this.robot.pollMap();
    }

    /**
     * @private
     * @param {object} payload
     * @returns {Promise<void>}
     */
    async sendMapEdit(payload) {
        const res = await this.robot.sendCommand("action",
            {
                did: this.robot.deviceId,
                siid: this.miot_actions.map_edit.siid,
                aiid: this.miot_actions.map_edit.aiid,
                in: [
                    {
                        piid: this.miot_properties.mapDetails.piid,
                        value: JSON.stringify(payload)
                    }
                ]
            }
        );

        if (
            res && (res.code === undefined || res.code === 0) &&
            res.siid === this.miot_actions.map_edit.siid &&
            res.aiid === this.miot_actions.map_edit.aiid &&
            Array.isArray(res.out) && res.out.length === 1 &&
            res.out[0].piid === this.miot_properties.actionResult.piid
        ) {
            switch (res.out[0].value) {
                case 0:
                    return;
                default:
                    throw new RobotFirmwareError("Got error " + res.out[0].value + " while saving map annotations.");
            }
        } else {
            throw new RobotFirmwareError("Received unexpected response while saving map annotations.");
        }
    }
}

/**
 * @param {any} entry
 * @param {number} minLength
 * @returns {boolean}
 */
function isValidVwsEntry(entry, minLength) {
    return (
        Array.isArray(entry) &&
        entry.length >= minLength &&
        entry.slice(0, minLength).every(Number.isFinite)
    );
}

/**
 * @param {any} areas
 * @returns {boolean}
 */
function isValidAreaList(areas) {
    return Array.isArray(areas) && areas.every(area => {
        return (
            Array.isArray(area) &&
            area.length === 4 &&
            area.every(point => {
                return (
                    !!point &&
                    Number.isInteger(point.x) &&
                    Number.isInteger(point.y) &&
                    point.x >= 0 && point.x <= MAX_COORDINATE &&
                    point.y >= 0 && point.y <= MAX_COORDINATE
                );
            })
        );
    });
}

/**
 * @param {Array<Array<{x: number, y: number}>>} areas
 * @returns {Array<string>}
 */
function serializeAreas(areas) {
    return areas.map(area => {
        return JSON.stringify(area.map(p => {
            return [p.x, p.y];
        }));
    }).sort();
}

function isEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

const MAX_COORDINATE = 6553;

module.exports = DreameMapAnnotationsCapability;
