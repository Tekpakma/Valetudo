import {
    Capability,
    StatusState,
    useLowClearanceAreasMutation,
    useMapAnnotationsMutation,
    useMapAnnotationsPropertiesQuery,
    ValetudoMapAnnotation,
    ValetudoMapAnnotationType,
} from "../../../api";
import React from "react";
import {Box, Button, CircularProgress, Container, Grid2, Typography} from "@mui/material";
import {ActionButton} from "../../Styled";
import {PointCoordinates} from "../../utils/types";
import {Add as AddIcon, Clear as ClearIcon, Refresh as RefreshIcon, Save as SaveIcon,} from "@mui/icons-material";
import {AddCurtainIcon, AddLowClearanceIcon, AddRampIcon, AddThresholdIcon} from "../../../components/CustomIcons";
import MapActionsCombinedActionsMenuPopoverButton from "../../MapActionsCombinedActionsMenuPopoverButton";
import ThresholdClientStructure from "../../structures/client_structures/ThresholdClientStructure";
import CurtainClientStructure from "../../structures/client_structures/CurtainClientStructure";
import RampClientStructure from "../../structures/client_structures/RampClientStructure";
import LowClearanceClientStructure from "../../structures/client_structures/LowClearanceClientStructure";

interface MapAnnotationActionsProperties {
    robotStatus: StatusState,
    thresholds: Array<ThresholdClientStructure>,
    curtains: Array<CurtainClientStructure>,
    ramps: Array<RampClientStructure>,
    lowClearanceAreas: Array<LowClearanceClientStructure>,
    lowClearanceEditable: boolean,

    savedMapAnnotations: Array<ValetudoMapAnnotation>,
    savedLowClearanceAreas: Array<Array<PointCoordinates>>,

    convertPixelCoordinatesToCMSpace(coordinates: PointCoordinates) : PointCoordinates
    convertLowClearanceCoordinatesToCMSpace(coordinates: PointCoordinates) : PointCoordinates

    onAddThreshold(): void,
    onAddCurtain(): void,
    onAddRamp(): void,
    onAddLowClearanceArea(): void,

    onSave(): void;
    onRefresh(): void;
    onClear(): void;
}

const serializeMapAnnotations = (mapAnnotations: Array<ValetudoMapAnnotation>): string => {
    return JSON.stringify(
        mapAnnotations.map(annotation => {
            return JSON.stringify([
                annotation.type,
                annotation.points.map(p => {
                    return [p.x, p.y];
                })
            ]);
        }).sort()
    );
};

const serializeLowClearanceAreas = (areas: Array<Array<PointCoordinates>>): string => {
    return JSON.stringify(
        areas.map(area => {
            return JSON.stringify(area);
        }).sort()
    );
};

const MapAnnotationActions = (
    props: MapAnnotationActionsProperties
): React.ReactElement => {
    const {
        thresholds,
        curtains,
        ramps,
        lowClearanceAreas,
        lowClearanceEditable,

        savedMapAnnotations,
        savedLowClearanceAreas,

        convertPixelCoordinatesToCMSpace,
        convertLowClearanceCoordinatesToCMSpace,


        onAddThreshold,
        onAddCurtain,
        onAddRamp,
        onAddLowClearanceArea,

        onSave,
        onRefresh,
        onClear
    } = props;


    const {
        data: mapAnnotationsProperties,
        isPending: mapAnnotationsPropertiesPending,
        isError: mapAnnotationsPropertiesLoadError,
        refetch: refetchMapAnnotationsProperties,
    } = useMapAnnotationsPropertiesQuery();

    const {
        mutateAsync: saveAnnotations,
        isPending: annotationsSaving
    } = useMapAnnotationsMutation();
    const {
        mutateAsync: saveLowClearanceAreas,
        isPending: lowClearanceAreasSaving
    } = useLowClearanceAreasMutation();
    const saving = annotationsSaving || lowClearanceAreasSaving;
    const canEdit = props.robotStatus.value === "docked";

    const handleSaveClick = React.useCallback(async () => {
        if (!canEdit) {
            return;
        }
        const mapAnnotations : Array<ValetudoMapAnnotation> = [];

        thresholds.forEach((t) => {
            const pA = convertPixelCoordinatesToCMSpace({
                x: t.x0,
                y: t.y0
            });
            const pC = convertPixelCoordinatesToCMSpace({
                x: t.x1,
                y: t.y1
            });

            mapAnnotations.push({
                type: ValetudoMapAnnotationType.Threshold,
                points: [ pA, pC ]
            });
        });

        curtains.forEach((t) => {
            const pA = convertPixelCoordinatesToCMSpace({
                x: t.x0,
                y: t.y0
            });
            const pC = convertPixelCoordinatesToCMSpace({
                x: t.x1,
                y: t.y1
            });

            mapAnnotations.push({
                type: ValetudoMapAnnotationType.Curtain,
                points: [ pA, pC ]
            });
        });

        ramps.forEach((t) => {
            mapAnnotations.push({
                type: ValetudoMapAnnotationType.Ramp,
                points: [
                    convertPixelCoordinatesToCMSpace({
                        x: t.x0,
                        y: t.y0
                    }),
                    convertPixelCoordinatesToCMSpace({
                        x: t.x1,
                        y: t.y1
                    }),
                    convertPixelCoordinatesToCMSpace({
                        x: t.x2,
                        y: t.y2
                    }),
                    convertPixelCoordinatesToCMSpace({
                        x: t.x3,
                        y: t.y3
                    })
                ]
            });
        });

        const areas = lowClearanceAreas.map((a) => {
            return [
                convertLowClearanceCoordinatesToCMSpace({
                    x: a.x0,
                    y: a.y0
                }),
                convertLowClearanceCoordinatesToCMSpace({
                    x: a.x1,
                    y: a.y1
                }),
                convertLowClearanceCoordinatesToCMSpace({
                    x: a.x2,
                    y: a.y2
                }),
                convertLowClearanceCoordinatesToCMSpace({
                    x: a.x3,
                    y: a.y3
                })
            ];
        });

        /*
            Map annotations and low-clearance areas are saved separately.
            To not unnecessarily touch anything on the robot, we only save what actually changed
         */
        const mapAnnotationsChanged = serializeMapAnnotations(mapAnnotations) !== serializeMapAnnotations(savedMapAnnotations);
        const lowClearanceAreasChanged = (
            lowClearanceEditable &&
            serializeLowClearanceAreas(areas) !== serializeLowClearanceAreas(savedLowClearanceAreas)
        );

        try {
            if (mapAnnotationsChanged) {
                await saveAnnotations(mapAnnotations);
            }

            if (lowClearanceAreasChanged) {
                await saveLowClearanceAreas({
                    areas: areas,
                    expectedAreas: savedLowClearanceAreas
                });
            }

            onSave();
        } catch {
            // Errors are already displayed by the mutation hooks. Unsaved changes are kept so that they can be retried
        }
    }, [
        canEdit,
        saveAnnotations,
        saveLowClearanceAreas,
        thresholds,
        curtains,
        ramps,
        lowClearanceAreas,
        lowClearanceEditable,
        savedMapAnnotations,
        savedLowClearanceAreas,
        convertPixelCoordinatesToCMSpace,
        convertLowClearanceCoordinatesToCMSpace,
        onSave
    ]);

    if (mapAnnotationsPropertiesLoadError) {
        return (
            <Container>
                <Typography color="error">
                    Error loading {Capability.MapAnnotations} properties
                </Typography>
                <Box m={1}/>
                <Button color="primary" variant="contained" onClick={() => {
                    return refetchMapAnnotationsProperties();
                }}>
                    <RefreshIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                    Retry
                </Button>
            </Container>
        );
    }

    if (mapAnnotationsProperties === undefined && mapAnnotationsPropertiesPending) {
        return (
            <Container>
                <CircularProgress/>
            </Container>
        );
    }

    if (mapAnnotationsProperties === undefined) {
        return (
            <Container>
                <Typography align="center">
                    No {Capability.MapAnnotations} properties
                </Typography>
            </Container>
        );
    }


    return (
        <Grid2 container spacing={1} direction="row-reverse" flexWrap="wrap-reverse">
            {
                canEdit &&
                <Grid2>
                    <ActionButton
                        disabled={saving}
                        color="inherit"
                        size="medium"
                        variant="extended"
                        onClick={handleSaveClick}
                    >
                        <SaveIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                        Save
                        {saving && (
                            <CircularProgress
                                color="inherit"
                                size={18}
                                style={{marginLeft: 10}}
                            />
                        )}
                    </ActionButton>
                </Grid2>
            }
            {
                canEdit &&

                <MapActionsCombinedActionsMenuPopoverButton
                    icon={<AddIcon/>}
                    label="Add"
                    disabled={saving}
                >
                    {(close) => (
                        <>
                            {
                                mapAnnotationsProperties.supportedAnnotationTypes.includes(ValetudoMapAnnotationType.Threshold) &&
                                <ActionButton
                                    color="inherit"
                                    size="medium"
                                    variant="extended"
                                    onClick={() => {
                                        onAddThreshold();
                                        close();
                                    }}
                                >
                                    <AddThresholdIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                                    Threshold ({thresholds.length})
                                </ActionButton>
                            }
                            {
                                mapAnnotationsProperties.supportedAnnotationTypes.includes(ValetudoMapAnnotationType.Curtain) &&
                                <ActionButton
                                    color="inherit"
                                    size="medium"
                                    variant="extended"
                                    onClick={() => {
                                        onAddCurtain();
                                        close();
                                    }}
                                >
                                    <AddCurtainIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                                    Curtain ({curtains.length})
                                </ActionButton>
                            }
                            {
                                mapAnnotationsProperties.supportedAnnotationTypes.includes(ValetudoMapAnnotationType.Ramp) &&
                                <ActionButton
                                    color="inherit"
                                    size="medium"
                                    variant="extended"
                                    onClick={() => {
                                        onAddRamp();
                                        close();
                                    }}
                                >
                                    <AddRampIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                                    Ramp ({ramps.length})
                                </ActionButton>
                            }
                            {
                                mapAnnotationsProperties.lowClearanceSupported && lowClearanceEditable &&
                                <ActionButton
                                    color="inherit"
                                    size="medium"
                                    variant="extended"
                                    onClick={() => {
                                        onAddLowClearanceArea();
                                        close();
                                    }}
                                >
                                    <AddLowClearanceIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                                    Low-clearance area ({lowClearanceAreas.length})
                                </ActionButton>
                            }
                        </>
                    )}
                </MapActionsCombinedActionsMenuPopoverButton>
            }
            {
                canEdit && mapAnnotationsProperties.lowClearanceSupported && !lowClearanceEditable &&
                <Grid2>
                    <Typography variant="caption" color="textSecondary">
                        Waiting for complete low-clearance map data
                    </Typography>
                </Grid2>
            }
            {
                canEdit &&
                <Grid2>
                    <ActionButton
                        color="inherit"
                        size="medium"
                        disabled={
                            saving ||
                            (
                                thresholds.length === 0 &&
                                curtains.length === 0 &&
                                ramps.length === 0 &&
                                lowClearanceAreas.length === 0
                            )
                        }
                        variant="extended"
                        onClick={onClear}
                    >
                        <ClearIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                        Clear
                    </ActionButton>
                </Grid2>
            }
            {
                canEdit &&
                <Grid2>
                    <ActionButton
                        color="inherit"
                        size="medium"
                        variant="extended"
                        disabled={saving}
                        onClick={onRefresh}
                    >
                        <RefreshIcon style={{marginRight: "0.25rem", marginLeft: "-0.25rem"}}/>
                        Refresh
                    </ActionButton>
                </Grid2>
            }
            {
                !canEdit &&
                <Grid2>
                    <Typography variant="caption" color="textSecondary">
                        Editing map annotations requires the robot to be docked
                    </Typography>
                </Grid2>
            }
        </Grid2>
    );
};

export default MapAnnotationActions;
