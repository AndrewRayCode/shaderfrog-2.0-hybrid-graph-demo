import React, { memo, useEffect, useMemo } from 'react';
import classnames from 'classnames/bind';
import {
  Handle,
  Position,
  Node as FlowNode,
  Edge as FlowEdge,
  HandleProps,
} from 'react-flow-renderer';

import styles from './flownode.module.css';
const cx = classnames.bind(styles);

import { ShaderStage } from '../../../core/graph';

import { useUpdateNodeInternals } from 'react-flow-renderer';
import {
  GraphDataType,
  Vector2,
  Vector3,
  Vector4,
} from '../../../core/nodes/data-nodes';
import { InputCategory, NodeInput } from '../../../core/nodes/core-node';
import { ChangeHandler, useFlowEventHack } from '../../flowEventHack';
import { replaceAt } from '../../../util/replaceAt';
import groupBy from 'lodash.groupby';

const headerHeight = 30;
const labelHeight = 38;
const inputHeight = 20;
const handleTop = 45;
const textHeight = 10;

export type InputNodeHandle = {
  name: string;
  id: string;
  type: string;
  validTarget: boolean;
  accepts?: Set<InputCategory>;
  baked?: boolean;
  bakeable: boolean;
};

type OutputNodeHandle = {
  validTarget: boolean;
  category?: InputCategory;
  id: string;
  name: string;
};

export const flowOutput = (name: string, id?: string): OutputNodeHandle => ({
  validTarget: false,
  id: id || name,
  name,
});

export interface CoreFlowNode {
  label: string;
  outputs: OutputNodeHandle[];
  inputs: InputNodeHandle[];
}
export interface FlowNodeDataData extends CoreFlowNode {
  type: GraphDataType;
  value: any;
}
export interface FlowNodeSourceData extends CoreFlowNode {
  stage?: ShaderStage;
  category?: InputCategory;
  active: boolean;
  /**
   * Whether or not this node can be used for both shader fragment and vertex
   */
  biStage: boolean;
  onInputBakedToggle: (id: string, name: string, baked: boolean) => void;
}
export type FlowNodeData = FlowNodeSourceData | FlowNodeDataData;

// interface NodeProp {
//   nodeId: string;
// }
// interface CustomHandleProps extends HandleProps, NodeProp {}

// const CustomHandle = ({ nodeId, id, handleIndex, ...props }: any) => {
//   // const updateNodeInternals = useUpdateNodeInternals();
//   // useEffect(() => {
//   //   // Hack for handle updating
//   //   setTimeout(() => {
//   //     updateNodeInternals(nodeId);
//   //   }, 0);
//   // }, [nodeId, updateNodeInternals, handleIndex, id]);

//   return <Handle id={id} {...props} />;
// };

// const computeIOKey = (arr: NodeHandle[]) => arr.map((a) => a.name).join(',');

const FlowWrap = ({
  children,
  data,
  height,
  className,
}: {
  children: React.ReactNode;
  height?: number;
  data: FlowNodeData;
  className: any;
}) => (
  <div
    className={classnames('flownode', className)}
    style={{
      height: height || `${handleTop + Math.max(data.inputs.length, 1) * 20}px`,
      zIndex: 0,
    }}
  >
    {children}
  </div>
);

const vectorComponents = 'xyzw';
const VectorEditor = ({
  id,
  value,
  onChange,
}: {
  id: string;
  value: Vector2 | Vector3 | Vector4;
  onChange: ChangeHandler;
}) => {
  const onComponentChange = (component: number, n: string) => {
    onChange(id, replaceAt(value, component, n));
  };
  return (
    <div className={styles.grid}>
      {value.map((_, index) => (
        <div key={index}>
          <label className={styles.vectorLabel}>
            {vectorComponents.charAt(index)}
            <input
              className="nodrag"
              type="text"
              onChange={(e) => onComponentChange(index, e.currentTarget.value)}
              value={value[index]}
            />
          </label>
        </div>
      ))}
    </div>
  );
};

const colorComponents = 'rgba';
const ColorEditor = ({
  id,
  value,
  onChange,
}: {
  id: string;
  value: Vector3 | Vector4;
  onChange: ChangeHandler;
}) => {
  const onComponentChange = (component: number, n: string) => {
    onChange(id, replaceAt(value, component, n));
  };
  return (
    <div className={styles.grid}>
      {value.map((_, index) => (
        <div key={index}>
          <label className={styles.vectorLabel}>
            {colorComponents.charAt(index)}
            <input
              className="nodrag"
              type="text"
              onChange={(e) => onComponentChange(index, e.currentTarget.value)}
              value={value[index]}
            />
          </label>
        </div>
      ))}
    </div>
  );
};

const NumberEditor = ({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: ChangeHandler;
}) => (
  <>
    <input
      className="nodrag"
      type="text"
      onChange={(e) => onChange(id, e.currentTarget.value)}
      value={value}
    />
    <input
      className="nodrag"
      type="range"
      min="0"
      max="1"
      step="0.001"
      onChange={(e) => onChange(id, e.currentTarget.value)}
      value={value}
    ></input>
  </>
);

const TextureEditor = ({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: ChangeHandler;
}) => (
  <>
    <select
      className="nodrag"
      onChange={(e) => onChange(id, e.currentTarget.value)}
      value={value}
    >
      <option value="grayscale-noise">Grayscale Noise</option>
      <option value="brick">Bricks</option>
      <option value="brickNormal">Brick Normal Map</option>
    </select>
  </>
);

const DataNodeComponent = memo(
  ({ id, data }: { id: string; data: FlowNodeDataData }) => {
    const onChange = useFlowEventHack();

    return (
      <FlowWrap data={data} className={cx('flow-node_data', data.type)}>
        <div className="flowlabel">{data.label}</div>
        <div className="flowInputs">
          {data.inputs.map((input, index) => (
            <React.Fragment key={input.id}>
              <Handle
                isConnectable
                id={input.id}
                className={cx({ validTarget: input.validTarget })}
                type="target"
                position={Position.Left}
                style={{ top: `${handleTop + index * 20}px` }}
              />
              <div
                className={cx('react-flow_handle_label', {
                  validTarget: input.validTarget,
                })}
                style={{
                  top: `${handleTop - textHeight + index * 20}px`,
                  left: 15,
                }}
              >
                {input.name}
              </div>
            </React.Fragment>
          ))}
        </div>

        <div className="body">
          {data.type === 'number' ? (
            <NumberEditor id={id} value={data.value} onChange={onChange} />
          ) : data.type === 'vector2' ||
            data.type === 'vector3' ||
            data.type === 'vector4' ? (
            <VectorEditor id={id} value={data.value} onChange={onChange} />
          ) : data.type === 'rgb' || data.type === 'rgba' ? (
            <ColorEditor id={id} value={data.value} onChange={onChange} />
          ) : data.type === 'texture' ? (
            <TextureEditor id={id} value={data.value} onChange={onChange} />
          ) : (
            <div>NOOOOOO FlowNode for {data.type}</div>
          )}
        </div>

        <div className={styles.outputs}>
          {data.outputs.map((output, index) => (
            <React.Fragment key={output.name}>
              <Handle
                isConnectable
                id={output.id}
                className={cx({ validTarget: output.validTarget })}
                type="source"
                position={Position.Right}
                style={{ top: `${handleTop + index * 20}px` }}
              >
                <div
                  className={cx('react-flow_handle_label', styles.outputLabel)}
                >
                  {output.name}
                </div>
              </Handle>
            </React.Fragment>
          ))}
        </div>
      </FlowWrap>
    );
  }
);
DataNodeComponent.displayName = 'DataNodeComponent';

const SourceNodeComponent = memo(
  ({ id, data }: { id: string; data: FlowNodeSourceData }) => {
    // const updateNodeInternals = useUpdateNodeInternals();
    // const key = `${computeIOKey(data.inputs)}${computeIOKey(data.outputs)}`;

    // useEffect(() => {
    //   console.log('Effect running', { id });
    //   updateNodeInternals(id);
    //   return () => {
    //     updateNodeInternals(id);
    //   };
    // }, [id, updateNodeInternals, key]);

    const [groups, height] = useMemo<
      [{ name: string; inputs: InputNodeHandle[]; offset: number }[], number]
    >(() => {
      const labels: Record<string, string> = {
        uniform: 'Uniforms',
        property: 'Properties',
        filler: 'Code',
      };
      const group = groupBy<InputNodeHandle>(data.inputs, 'type');
      let offset = 0;
      return [
        Object.entries(group).map(([key, inputs]) => {
          const result = {
            name: labels[key] || `UNKNOWN ${key}`,
            inputs,
            offset,
          };
          offset += labelHeight + inputs.length * inputHeight;
          return result;
        }),
        offset,
      ];
    }, [data.inputs]);

    return (
      <FlowWrap
        data={data}
        height={height + headerHeight}
        className={cx(data.stage, data.category, { inactive: !data.active })}
      >
        <div className="flowlabel">
          {data.label}
          {data.stage ? (
            <div className="stage">
              {data.stage === 'fragment' ? 'FRAG' : 'VERT'}
            </div>
          ) : null}
        </div>
        <div className="flowInputs">
          {groups.map((group) => (
            <React.Fragment key={group.name}>
              <div
                className={styles.inputSection}
                style={{
                  top: `${group.offset}px`,
                }}
              >
                {group.name}
              </div>
              {group.inputs.map((input, index) => (
                // <React.Fragment key={input.id}>
                <Handle
                  key={input.id}
                  isConnectable
                  id={input.id}
                  className={cx({ validTarget: input.validTarget })}
                  type="target"
                  position={Position.Left}
                  style={{
                    top: `${group.offset + labelHeight + index * 20}px`,
                  }}
                >
                  <div
                    className={cx('react-flow_handle_label', {
                      validTarget: input.validTarget,
                    })}
                  >
                    <div
                      className="switch"
                      onClick={(e) => (
                        e.preventDefault(),
                        data.onInputBakedToggle(id, input.id, !input.baked)
                      )}
                    >
                      {input.bakeable ? (input.baked ? '🔒 ' : '➡️') : null}
                    </div>
                    {input.name}
                  </div>
                </Handle>
                // </React.Fragment>
              ))}
            </React.Fragment>
          ))}

          <div className={cx(styles.outputs, styles.outputWithLabel)}>
            {data.outputs.map((output, index) => (
              <Handle
                key={output.id}
                isConnectable
                id={output.id}
                className={cx({
                  validTarget: output.validTarget,
                })}
                type="source"
                position={Position.Right}
              >
                <div
                  className={cx('react-flow_handle_label', styles.outputLabel)}
                >
                  {output.name}
                </div>
              </Handle>
            ))}
          </div>
        </div>

        {/* These are not currently shown - replace with floating edges? */}
        <Handle
          isConnectable
          id="from"
          className="next-stage-handle"
          type="source"
          position={Position.Right}
        />
        <Handle
          isConnectable
          id="to"
          className="next-stage-handle"
          type="target"
          position={Position.Right}
        />
      </FlowWrap>
    );
  }
);
SourceNodeComponent.displayName = 'SourceNodeComponent';

export { DataNodeComponent, SourceNodeComponent };
