import React from 'react';
import {
  EdgeProps,
  getBezierPath,
  // getEdgeCenter,
  getMarkerEnd,
} from 'react-flow-renderer';

export default function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
  arrowHeadType,
  markerEndId,
}: EdgeProps<any>) {
  const edgePath = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const markerEnd = getMarkerEnd(arrowHeadType, markerEndId);
  // const [edgeCenterX, edgeCenterY] = getEdgeCenter({
  //   sourceX,
  //   sourceY,
  //   targetX,
  //   targetY,
  // });

  return (
    <>
      <path
        style={style}
        className="react-flow__edge-path-selector"
        d={edgePath}
        markerEnd={markerEnd}
        fillRule="evenodd"
      />
      <path
        style={style}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
        fillRule="evenodd"
      />
    </>
  );
}
