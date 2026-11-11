import MapStructure from "./MapStructure";
import {Canvas2DContextTrackingWrapper} from "../../utils/Canvas2DContextTrackingWrapper";
import {considerHiDPI} from "../../utils/helpers";
import {PointCoordinates} from "../../utils/types";

class LowClearanceMapStructure extends MapStructure {
    public static readonly TYPE = "LowClearanceMapStructure";
    private points: Array<PointCoordinates>;
    private manual: boolean;

    constructor(points: Array<PointCoordinates>, manual: boolean) {
        super(points[0].x, points[0].y);
        this.points = points;
        this.manual = manual;
    }

    draw(ctxWrapper: Canvas2DContextTrackingWrapper, transformationMatrixToScreenSpace: DOMMatrixInit): void {
        const ctx = ctxWrapper.getContext();
        const points = this.points.map(point => new DOMPoint(point.x, point.y).matrixTransform(transformationMatrixToScreenSpace));
        ctxWrapper.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach(point => ctx.lineTo(point.x, point.y));
        ctx.closePath();
        ctx.fillStyle = "rgba(168, 85, 247, 0.12)";
        ctx.fill();
        ctx.lineWidth = considerHiDPI(2);
        ctx.strokeStyle = "rgba(168, 85, 247, 0.9)";
        ctx.setLineDash(this.manual ? [] : [considerHiDPI(4), considerHiDPI(3)]);
        ctx.stroke();
        ctxWrapper.restore();
    }
}

export default LowClearanceMapStructure;
