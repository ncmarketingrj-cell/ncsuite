import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';

export const FunnelEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
  markerEnd,
}: EdgeProps) => {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
  });

  // Heatmap logic based on BAM / friction data
  const friction = Number(data?.friction ?? 0); // 0 to 1
  let strokeColor = "#64748b"; // muted normal
  
  if (friction > 0.7) {
    strokeColor = "#ef4444"; // red: high friction / bottleneck
  } else if (friction > 0.4) {
    strokeColor = "#f59e0b"; // orange: medium
  } else if (friction > 0) {
    strokeColor = "#10b981"; // green: flowing perfectly
  }

  const customStyle = {
    ...style,
    stroke: (data?.color as string) || strokeColor,
    strokeWidth: friction > 0.7 ? 3 : 2,
  } as any;

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={customStyle} />
      
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <div className="px-2.5 py-1 rounded-full bg-background border border-border text-[10px] font-bold shadow-md">
              {data?.label as string}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
