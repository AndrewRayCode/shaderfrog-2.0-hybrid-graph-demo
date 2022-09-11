export type InputCategory = 'data' | 'code';
export type InputType = 'uniform' | 'property' | 'filler';

export interface NodeInput {
  displayName: string;
  id: string;
  type: InputType;
  accepts: Set<InputCategory>;
  baked?: boolean;
  bakeable: boolean;
  property?: string;
}
export const nodeInput = (
  displayName: string,
  id: string,
  type: InputType,
  accepts: Set<InputCategory>,
  bakeable: boolean,
  property?: string
): NodeInput => ({
  displayName,
  id,
  type,
  accepts,
  bakeable,
  property,
});

export interface NodeOutput {
  name: string;
  id: string;
  category: InputCategory;
}

export type NodePosition = { x: number; y: number };
export interface CoreNode {
  id: string;
  name: string;
  type: string;
  inputs: NodeInput[];
  outputs: NodeOutput[];
  position: NodePosition;
}
