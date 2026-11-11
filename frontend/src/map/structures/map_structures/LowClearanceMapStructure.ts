import MapStructure from "./MapStructure";
import {Canvas2DContextTrackingWrapper} from "../../utils/Canvas2DContextTrackingWrapper";
import {considerHiDPI} from "../../utils/helpers";

class LowClearanceMapStructure extends MapStructure {
    public static readonly TYPE = "LowClearanceMapStructure";

    private readonly points: Array<{x: number, y: number}>;
    private readonly manual: boolean;


    constructor(
        points: Array<{x: number, y: number}>,
        manual: boolean
    ) {
        super(points[0].x, points[0].y); // Doesn't really make sense here, but whatever
        this.points = points;
        this.manual = manual;
    }

    draw(ctxWrapper: Canvas2DContextTrackingWrapper, transformationMatrixToScreenSpace: DOMMatrixInit, scaleFactor: number): void {
        const ctx = ctxWrapper.getContext();

        const screenPoints = this.points.map(p =>
            new DOMPoint(p.x, p.y).matrixTransform(transformationMatrixToScreenSpace)
        );

        ctxWrapper.save();

        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        ctx.beginPath();
        ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
        for (let i = 1; i < screenPoints.length; i++) {
            ctx.lineTo(screenPoints[i].x, screenPoints[i].y);
        }
        ctx.closePath();

        ctx.fillStyle = "rgba(168, 85, 247, 0.12)";
        ctx.fill();

        ctx.lineWidth = considerHiDPI(2);
        ctx.strokeStyle = "rgba(168, 85, 247, 0.9)";

        if (!this.manual) {
            ctx.setLineDash([considerHiDPI(4), considerHiDPI(3)]);
        }

        ctx.stroke();

        ctxWrapper.restore();
    }
}

export default LowClearanceMapStructure;
