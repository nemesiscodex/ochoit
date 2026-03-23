import { createContext, type ReactNode, useContext } from "react";

import type { Skin } from "@/features/ui/skin-config";

const SkinRuntimeContext = createContext<Skin>("classic");

export function SkinRuntimeProvider({ children, skin }: { children: ReactNode; skin: Skin }) {
  return <SkinRuntimeContext.Provider value={skin}>{children}</SkinRuntimeContext.Provider>;
}

export function useActiveSkin() {
  return useContext(SkinRuntimeContext);
}

export function useIsRetroSkin() {
  return useActiveSkin() === "8bitcn";
}
