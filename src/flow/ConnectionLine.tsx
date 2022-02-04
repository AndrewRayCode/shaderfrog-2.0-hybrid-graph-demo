import React from 'react';
import cx from 'classnames';

import {
  ConnectionLineComponentProps,
  getBezierPath,
  Position,
} from 'react-flow-renderer';

const ConnectionLine = ({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  connectionLineType,
  connectionLineStyle,
  sourceNode,
  sourceHandle,
}: ConnectionLineComponentProps) => {
  const edgePath = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <g className={cx('react-flow__edge animated', sourceNode?.data?.stage)}>
      <path className="react-flow__edge-path" d={edgePath} fillRule="evenodd" />
    </g>
  );
};

export default ConnectionLine;
