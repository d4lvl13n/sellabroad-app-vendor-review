import { useAppBridge } from "@saleor/app-sdk/app-bridge";
import { Box, Text } from "@saleor/macaw-ui";
import { NextPage } from "next";
import { useEffect, useState } from "react";

const IndexPage: NextPage = () => {
  const { appBridgeState } = useAppBridge();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Box padding={8}>
      <Text size={11}>SellAbroad Payment App</Text>
      <Text as={"p"} marginY={4}>
        This app connects your Saleor storefront to SellAbroad&apos;s Payment Container for
        processing payments via card, 3DS, BNPL, and wallet providers.
      </Text>
      {mounted && appBridgeState?.ready && (
        <Text as={"p"} color={"info1"}>
          App is connected to Saleor. Payment webhooks are active.
        </Text>
      )}
    </Box>
  );
};

export default IndexPage;
