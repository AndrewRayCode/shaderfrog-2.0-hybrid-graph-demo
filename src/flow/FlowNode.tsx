import React from 'react';
import cx from 'classnames';
import {
  Handle,
  Position,
  Node as FlowNode,
  Edge as FlowEdge,
} from 'react-flow-renderer';
import { ShaderStage } from '../nodestuff';

const handleTop = 40;
const textHeight = 10;
type NodeHandle = {
  validTarget: boolean;
  name: string;
};
export type FlowNodeData = {
  label: string;
  stage?: ShaderStage;
  biStage: boolean;
  outputs: NodeHandle[];
  inputs: NodeHandle[];
};
type NodeProps = {
  data: FlowNodeData;
};
const CustomNodeComponent = ({ data }: NodeProps) => {
  return (
    <div
      className={'flownode ' + data.stage}
      style={{
        height: `${handleTop + Math.max(data.inputs.length, 1) * 20}px`,
      }}
    >
      <div className="flowlabel">{data.label}</div>
      <div className="flowInputs">
        {data.inputs.map((input, index) => (
          <React.Fragment key={input.name}>
            <div
              className="react-flow_handle_label"
              style={{
                top: `${handleTop - textHeight + index * 20}px`,
                left: 15,
              }}
            >
              {input.name}
            </div>
            <Handle
              id={input.name}
              className={cx({ validTarget: input.validTarget })}
              type="target"
              position={Position.Left}
              style={{ top: `${handleTop + index * 20}px` }}
            />
          </React.Fragment>
        ))}

        {data.outputs.map((output, index) => (
          <React.Fragment key={output.name}>
            <div
              className="react-flow_handle_label"
              style={{
                top: `${handleTop - textHeight + index * 20}px`,
                right: 15,
              }}
            >
              {output.name}
            </div>
            <Handle
              id={output.name}
              className={cx({ validTarget: output.validTarget })}
              type="source"
              position={Position.Right}
              style={{ top: `${handleTop + index * 20}px` }}
            />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default CustomNodeComponent;
