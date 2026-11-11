import RestrictedZoneClientStructure from "./RestrictedZoneClientStructure";

class LowClearanceClientStructure extends RestrictedZoneClientStructure {
    public static readonly TYPE = "LowClearanceClientStructure";

    protected activeStyle : { stroke: string, fill: string } = {
        stroke: "rgb(168, 85, 247)",
        fill: "rgba(168, 85, 247, 0)"
    };

    protected style : { stroke: string, fill: string } = {
        stroke: "rgb(168, 85, 247)",
        fill: "rgba(168, 85, 247, 0.22)"
    };
}

export default LowClearanceClientStructure;
