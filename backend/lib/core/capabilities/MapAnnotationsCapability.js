const Capability = require("./Capability");
const NotImplementedError = require("../NotImplementedError");

/**
 * @template {import("../ValetudoRobot")} T
 * @extends Capability<T>
 */
class MapAnnotationsCapability extends Capability {
    /**
     *
     * @param {object} options
     * @param {T} options.robot
     * @param {Array<import("../../entities/core/ValetudoMapAnnotation").ValetudoMapAnnotationType>} options.supportedAnnotationTypes
     * @param {boolean} [options.lowClearanceSupported]
     * @class
     */
    constructor(options) {
        super(options);

        this.supportedAnnotationTypes = options.supportedAnnotationTypes ?? [];
        this.lowClearanceSupported = options.lowClearanceSupported ?? false;
    }

    /**
     *
     * @param {Array<import("../../entities/core/ValetudoMapAnnotation")>} mapAnnotations
     * @returns {Promise<void>}
     */
    async setMapAnnotations(mapAnnotations) {
        throw new NotImplementedError();
    }

    /**
     * Replaces all manually added low-clearance areas
     *
     * To not overwrite changes done elsewhere, expectedAreas has to match the areas the edit was based on
     *
     * @param {Array<Array<{x: number, y: number}>>} areas
     * @param {Array<Array<{x: number, y: number}>>} expectedAreas
     * @returns {Promise<void>}
     */
    async setLowClearanceAreas(areas, expectedAreas) {
        throw new NotImplementedError();
    }

    /**
     * @returns {MapAnnotationsCapabilityProperties}
     */
    getProperties() {
        return {
            supportedAnnotationTypes: this.supportedAnnotationTypes,
            lowClearanceSupported: this.lowClearanceSupported
        };
    }

    getType() {
        return MapAnnotationsCapability.TYPE;
    }
}

MapAnnotationsCapability.TYPE = "MapAnnotationsCapability";

module.exports = MapAnnotationsCapability;

/**
 * @typedef {object} MapAnnotationsCapabilityProperties
 *
 * @property {Array<import("../../entities/core/ValetudoMapAnnotation").ValetudoMapAnnotationType>} supportedAnnotationTypes
 * @property {boolean} lowClearanceSupported
 */
