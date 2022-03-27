import { createContext } from 'react';

export const HoistedRef = createContext<any>({});
export type HoistedRefGetter = <T extends unknown>(
  key: string,
  setter?: () => T
) => T;
