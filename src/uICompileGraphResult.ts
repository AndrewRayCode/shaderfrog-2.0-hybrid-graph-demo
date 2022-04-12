export type UICompileGraphResult = {
  compileMs: string;
  fragmentResult: string;
  vertexResult: string;
  activeNodeIds: Set<string>;
};
