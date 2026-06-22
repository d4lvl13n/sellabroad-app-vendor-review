import dynamic from "next/dynamic";
import React, { PropsWithChildren } from "react";

const Wrapper = (props: PropsWithChildren<{}>) => <>{props.children}</>;

export const NoSSRWrapper = dynamic(() => Promise.resolve(Wrapper), { ssr: false });
