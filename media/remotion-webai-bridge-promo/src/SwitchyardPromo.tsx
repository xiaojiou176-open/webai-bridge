import React from "react";
import {
  AbsoluteFill,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const palette = {
  bg: "#f5f7f2",
  bgSoft: "#fbfdf8",
  ink: "#153126",
  muted: "#577061",
  accent: "#22714b",
  accentSoft: "rgba(34, 113, 75, 0.12)",
  accentStrong: "#174f34",
  gold: "#b7863d",
  line: "rgba(21, 49, 38, 0.1)",
};

const identityShipRows = [
  "Docs",
  "Proof pack",
  "Read-only status",
] as const;

const sceneTitleStyle: React.CSSProperties = {
  fontSize: 100,
  lineHeight: 1,
  letterSpacing: "-0.06em",
  fontWeight: 800,
  color: palette.ink,
  margin: 0,
};

const sceneBodyStyle: React.CSSProperties = {
  fontSize: 34,
  lineHeight: 1.45,
  color: palette.muted,
  margin: 0,
  maxWidth: 900,
};

const cardStyle: React.CSSProperties = {
  borderRadius: 32,
  border: `1px solid ${palette.line}`,
  background: "rgba(255,255,255,0.84)",
  boxShadow: "0 18px 48px rgba(21, 49, 38, 0.08)",
  backdropFilter: "blur(18px)",
};

const chipStyle: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 999,
  border: `1px solid ${palette.line}`,
  background: "rgba(255,255,255,0.9)",
  fontSize: 24,
  fontWeight: 700,
  color: palette.ink,
};

const sceneDurations = {
  identity: 120,
  runtime: 150,
  truth: 150,
  close: 180,
} as const;

const totalFrames = Object.values(sceneDurations).reduce((sum, value) => sum + value, 0);

const riseIn = (frame: number, start: number, duration: number) =>
  spring({
    frame: frame - start,
    fps: 30,
    durationInFrames: duration,
    config: {
      damping: 200,
      stiffness: 170,
      mass: 1.1,
    },
  });

const fadeUpStyle = (
  frame: number,
  start: number,
  duration: number,
): React.CSSProperties => {
  const progress = riseIn(frame, start, duration);
  return {
    opacity: progress,
    transform: `translateY(${interpolate(progress, [0, 1], [28, 0])}px)`,
  };
};

const gradientBackdrop = (frame: number): React.CSSProperties => ({
  background: [
    `radial-gradient(circle at 15% 15%, rgba(34, 113, 75, ${interpolate(frame, [0, totalFrames], [0.18, 0.08])}), transparent 28%)`,
    `radial-gradient(circle at 82% 18%, rgba(183, 134, 61, ${interpolate(frame, [0, totalFrames], [0.14, 0.08])}), transparent 20%)`,
    `linear-gradient(180deg, ${palette.bgSoft} 0%, ${palette.bg} 100%)`,
  ].join(", "),
});

const FrameShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={gradientBackdrop(0)}>
    <AbsoluteFill
      style={{
        padding: "54px 64px",
        fontFamily:
          'Inter, "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif',
      }}
    >
      {children}
    </AbsoluteFill>
  </AbsoluteFill>
);

const IdentityScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <FrameShell>
      <div
        style={{
          ...cardStyle,
          display: "grid",
          gridTemplateColumns: "1.28fr 0.8fr",
          gap: 30,
          padding: 54,
          minHeight: 620,
        }}
      >
        <div style={fadeUpStyle(frame, 0, 28)}>
          <div
            style={{
              ...chipStyle,
              display: "inline-flex",
              background: palette.accentSoft,
              color: palette.accent,
            }}
          >
            WebaiBridge
          </div>
          <h1 style={{ ...sceneTitleStyle, marginTop: 26 }}>
            One shared provider runtime for AI apps.
          </h1>
          <p style={{ ...sceneBodyStyle, marginTop: 26 }}>
            BYOK + Web/Login. One service-first runtime. Proof before
            overclaim.
          </p>
          <div
            style={{
              display: "flex",
              gap: 14,
              flexWrap: "wrap",
              marginTop: 32,
            }}
          >
            {["BYOK + Web/Login", "Service-first", "Proof before overclaim"].map((item) => (
              <div key={item} style={chipStyle}>
                {item}
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            ...fadeUpStyle(frame, 10, 28),
            ...cardStyle,
            padding: 28,
            display: "grid",
            alignContent: "space-between",
            background: "rgba(245,250,246,0.92)",
          }}
        >
          <div
            style={{
              width: "100%",
              minHeight: 320,
              borderRadius: 24,
              border: `1px solid ${palette.line}`,
              background:
                "linear-gradient(145deg, rgba(255,255,255,0.96), rgba(238,246,240,0.92))",
              display: "grid",
              alignContent: "start",
              gap: 14,
              padding: 20,
            }}
          >
            <div style={{ display: "grid", gap: 10 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 18,
                  lineHeight: 1.3,
                  color: palette.accentStrong,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                }}
              >
                What ships now
              </p>
              {identityShipRows.map((row) => (
                <div
                  key={row}
                  style={{
                    padding: "14px 16px",
                    borderRadius: 18,
                    border: `1px solid ${palette.line}`,
                    background: "rgba(255,255,255,0.88)",
                    fontSize: 22,
                    lineHeight: 1.18,
                    color: palette.ink,
                    fontWeight: 700,
                  }}
                >
                  {row}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </FrameShell>
  );
};

const RuntimeScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();

  const cards = [
    {
      title: "Provider contracts stop drifting",
      body: "One runtime instead of each product rebuilding provider routing and invoke semantics alone.",
    },
    {
      title: "Web sessions stay local-first",
      body: "End-user BYOK plus Web/Login become one substrate rather than scattered browser glue.",
    },
    {
      title: "Diagnostics stay attached to runtime truth",
      body: "Probe, remediation, support bundle, and fail-closed public claims stay in the same story.",
    },
  ];

  return (
    <FrameShell>
      <div style={{ ...fadeUpStyle(frame, 0, 26), display: "flex", justifyContent: "space-between" }}>
        <div>
          <div
            style={{
              ...chipStyle,
              display: "inline-flex",
              background: "rgba(183,134,61,0.14)",
              color: palette.gold,
            }}
          >
            Why it matters
          </div>
          <h2 style={{ ...sceneTitleStyle, fontSize: 74, marginTop: 24 }}>
            One runtime layer,
            <br />
            fewer duplicated messes.
          </h2>
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 24,
          marginTop: 36,
        }}
      >
        {cards.map((card, index) => {
          const progress = riseIn(frame, 8 + index * 8, 30);
          return (
            <div
              key={card.title}
              style={{
                ...cardStyle,
                padding: 28,
                minHeight: 320,
                opacity: progress,
                transform: `translateY(${interpolate(progress, [0, 1], [40, 0])}px) translateX(${interpolate(
                  progress,
                  [0, 1],
                  [width * 0.015 * (index - 1), 0],
                )}px)`,
              }}
            >
              <p
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: palette.ink,
                  lineHeight: 1.22,
                  margin: 0,
                }}
              >
                {card.title}
              </p>
              <p style={{ ...sceneBodyStyle, fontSize: 26, marginTop: 18 }}>
                {card.body}
              </p>
            </div>
          );
        })}
      </div>
    </FrameShell>
  );
};

const TruthScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <FrameShell>
      <div
        style={{
          ...cardStyle,
          padding: 46,
          minHeight: 620,
          display: "grid",
          gridTemplateColumns: "1.05fr 0.95fr",
          gap: 32,
        }}
      >
        <div style={fadeUpStyle(frame, 0, 26)}>
          <div
            style={{
              ...chipStyle,
              display: "inline-flex",
              background: palette.accentSoft,
              color: palette.accent,
            }}
          >
            What ships now
          </div>
          <h2 style={{ ...sceneTitleStyle, fontSize: 70, marginTop: 24 }}>
            Strong public surface,
            <br />
            honest proof sequence.
          </h2>
          <div
            style={{
              marginTop: 28,
              display: "grid",
              gap: 14,
            }}
          >
            {[
              "Repo-native runtime and service-first HTTP surface",
              "Public docs that explain what ships now",
              "Read-only MCP status and runtime diagnostics packet",
              "Thin compat shelves that stay honest about current limits",
            ].map((item) => (
              <div
                key={item}
                style={{
                  display: "flex",
                  gap: 14,
                  alignItems: "flex-start",
                  fontSize: 28,
                  color: palette.ink,
                }}
              >
                <span style={{ color: palette.accent, fontWeight: 800 }}>+</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            ...fadeUpStyle(frame, 10, 26),
            display: "grid",
            gap: 18,
            alignContent: "start",
          }}
        >
          <div
            style={{
              ...cardStyle,
              padding: 24,
              background: "rgba(255,255,255,0.95)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 700,
                color: palette.accentStrong,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Truth ceiling
            </p>
            <p style={{ ...sceneBodyStyle, fontSize: 26, marginTop: 16 }}>
              Package-ready is not listed-live.
              <br />
              Partial is not parity.
              <br />
              Proof stays ahead of overclaim.
            </p>
          </div>
          <div
            style={{
              ...cardStyle,
              padding: 24,
              background: "rgba(244,248,244,0.94)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 700,
                color: palette.gold,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Later lanes
            </p>
            <p style={{ ...sceneBodyStyle, fontSize: 24, marginTop: 16 }}>
              npm publication, marketplace listing, registry listing, and full
              consumer parity still stay outside the current truth boundary.
            </p>
          </div>
        </div>
      </div>
    </FrameShell>
  );
};

const ClosingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const progress = riseIn(frame, 0, 34);

  return (
    <FrameShell>
      <AbsoluteFill
        style={{
          ...cardStyle,
          padding: "56px 64px",
          justifyContent: "space-between",
          background:
            "linear-gradient(160deg, rgba(255,255,255,0.95), rgba(243,249,245,0.88))",
        }}
      >
        <div style={{ opacity: progress, transform: `translateY(${interpolate(progress, [0, 1], [26, 0])}px)` }}>
          <div
            style={{
              ...chipStyle,
              display: "inline-flex",
              background: palette.accentSoft,
              color: palette.accent,
            }}
          >
            Public call to action
          </div>
          <h2 style={{ ...sceneTitleStyle, fontSize: 82, marginTop: 28 }}>
            Start at the front door.
          </h2>
          <p style={{ ...sceneBodyStyle, marginTop: 22, maxWidth: 980 }}>
            Read the 30-second overview. Run the shortest first success. Inspect
            the proof pack. Then decide whether the next lane is runtime,
            compat, MCP, or diagnostics.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 24,
            alignItems: "end",
          }}
        >
          <div
            style={{
              ...cardStyle,
              padding: 24,
              background: palette.ink,
              color: "#f4fbf6",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 24,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "rgba(244,251,246,0.72)",
              }}
            >
              Live route
            </p>
            <p
              style={{
                marginTop: 12,
                marginBottom: 0,
                fontSize: 42,
                fontWeight: 800,
                lineHeight: 1.15,
              }}
            >
              xiaojiou176-open.github.io/webai-bridge/
            </p>
          </div>
          <div
            style={{
              display: "grid",
              gap: 12,
              justifyItems: "end",
            }}
          >
            {["30-second overview", "First success", "Proof pack"].map((item, index) => (
              <div
                key={item}
                style={{
                  ...chipStyle,
                  fontSize: 22,
                  opacity: spring({
                    frame: frame - 12 - index * 5,
                    fps: 30,
                    durationInFrames: 26,
                    config: {
                      damping: 180,
                      stiffness: 160,
                    },
                  }),
                }}
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </AbsoluteFill>
    </FrameShell>
  );
};

export const WebaiBridgePromo: React.FC = () => {
  return (
    <AbsoluteFill style={gradientBackdrop(0)}>
      <Sequence from={0} durationInFrames={sceneDurations.identity}>
        <IdentityScene />
      </Sequence>
      <Sequence from={sceneDurations.identity} durationInFrames={sceneDurations.runtime}>
        <RuntimeScene />
      </Sequence>
      <Sequence
        from={sceneDurations.identity + sceneDurations.runtime}
        durationInFrames={sceneDurations.truth}
      >
        <TruthScene />
      </Sequence>
      <Sequence
        from={sceneDurations.identity + sceneDurations.runtime + sceneDurations.truth}
        durationInFrames={sceneDurations.close}
      >
        <ClosingScene />
      </Sequence>
    </AbsoluteFill>
  );
};

export const WebaiBridgePromoPoster: React.FC = () => {
  return (
    <AbsoluteFill style={gradientBackdrop(0)}>
      <AbsoluteFill
        style={{
          padding: "72px 88px",
          fontFamily:
            'Inter, "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif',
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            ...cardStyle,
            padding: 48,
            minHeight: 520,
            display: "grid",
            gridTemplateColumns: "1.3fr 0.7fr",
            gap: 32,
          }}
        >
          <div>
            <div
              style={{
                ...chipStyle,
                display: "inline-flex",
                background: palette.accentSoft,
                color: palette.accent,
              }}
            >
              Shared provider runtime
            </div>
            <h1 style={{ ...sceneTitleStyle, marginTop: 28 }}>
              WebaiBridge
            </h1>
            <p style={{ ...sceneBodyStyle, marginTop: 20 }}>
              One service-first runtime for AI apps.
              <br />
              BYOK + Web/Login.
              <br />
              Truth-first public surface.
            </p>
          </div>
          <div
            style={{
              ...cardStyle,
              padding: 24,
              background: "rgba(244,248,244,0.94)",
              display: "grid",
              alignContent: "center",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 24,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: palette.gold,
              }}
            >
              Live route
            </p>
            <p
              style={{
                marginTop: 16,
                marginBottom: 0,
                fontSize: 34,
                fontWeight: 800,
                lineHeight: 1.18,
                color: palette.ink,
              }}
            >
              xiaojiou176-open.github.io/webai-bridge/
            </p>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
