import { useAppBridge } from "@saleor/app-sdk/app-bridge";
import { useTheme } from "@saleor/macaw-ui";
import { useEffect } from "react";

export const ThemeSynchronizer = () => {
  const { appBridgeState } = useAppBridge();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (!setTheme || !appBridgeState?.theme) {
      return;
    }

    setTheme(appBridgeState.theme === "dark" ? "defaultDark" : "defaultLight");
  }, [appBridgeState?.theme, setTheme]);

  return null;
};
