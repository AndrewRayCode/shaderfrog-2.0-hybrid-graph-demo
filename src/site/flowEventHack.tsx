import { createContext, useContext } from 'react';

export const Context = createContext<any>({});
export type ChangeHandler = (
  id: string,
  event: React.FormEvent<HTMLInputElement>
) => void;

export const useFlowEventHack = () => {
  return useContext(Context) as ChangeHandler;
};

export const FlowEventHack = ({
  onChange,
  children,
}: {
  onChange: ChangeHandler;
  children: React.ReactNode;
}) => {
  return <Context.Provider value={onChange}>{children}</Context.Provider>;
};
