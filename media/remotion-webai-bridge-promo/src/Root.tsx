import React from "react";
import { Composition, Still } from "remotion";

import { WebaiBridgePromo, WebaiBridgePromoPoster } from "./WebaiBridgePromo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="WebaiBridgePromo"
        component={WebaiBridgePromo}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={20 * 30}
      />
      <Still
        id="WebaiBridgePromoPoster"
        component={WebaiBridgePromoPoster}
        width={1920}
        height={1080}
      />
    </>
  );
};
