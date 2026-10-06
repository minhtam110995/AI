// Các lớp dùng chung cho mọi template: hình nền theo cảnh, chuyển cảnh, phụ đề, âm thanh.
import React from 'react';
import {
  AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig, Easing,
} from 'remotion';
import { fontFamily, fontWeight } from '../fonts.js';

export const GRADES = {
  none: 'none',
  warm: 'sepia(0.18) saturate(1.15) contrast(1.05) brightness(1.02)',
  cool: 'saturate(0.95) hue-rotate(-10deg) contrast(1.06)',
  vivid: 'saturate(1.35) contrast(1.1)',
  bw: 'grayscale(1) contrast(1.15)',
  dark: 'brightness(0.5) saturate(0.85)',
};

export const useUnit = () => {
  const { width, height } = useVideoConfig();
  return Math.min(width, height) / 100; // 1 đơn vị = 1% cạnh ngắn
};

export const useTime = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return frame / fps;
};

export const sceneAt = (plan, t) => {
  let idx = 0;
  plan.scenes.forEach((s, i) => {
    if (t >= s.start) idx = i;
  });
  return idx;
};

// ---------- Phụ đề ----------

export function buildChunks(words, perChunk) {
  const chunks = [];
  let cur = [];
  const flush = () => {
    if (cur.length) chunks.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end, scene: cur[0].scene });
    cur = [];
  };
  for (const w of words) {
    if (cur.length && (cur.length >= perChunk || w.scene !== cur[0].scene)) flush();
    cur.push(w);
    if (/[.,!?…:;]$/.test(w.text)) flush();
  }
  flush();
  chunks.forEach((c, i) => {
    const next = chunks[i + 1];
    c.until = next ? Math.min(next.start, c.end + 0.6) : c.end + 0.6;
  });
  return chunks;
}

export function useChunks(plan) {
  return React.useMemo(() => buildChunks(plan.words || [], Math.max(1, plan.style.wordsPerChunk || 3)), [plan]);
}

export const chunkAt = (chunks, t) => chunks.findIndex((c) => t >= c.start - 0.05 && t < c.until);

export function Captions({ plan, variant = 'default', reveal = false, top }) {
  const { style } = plan;
  const t = useTime();
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const u = useUnit();
  const chunks = useChunks(plan);
  if (!style.captionsOn) return null;
  const idx = chunkAt(chunks, t);
  if (idx < 0) return null;
  const chunk = chunks[idx];
  const pop = spring({ frame: frame - Math.round(chunk.start * fps), fps, config: { damping: 14, stiffness: 220, mass: 0.6 } });
  const scale = variant === 'viral' ? interpolate(pop, [0, 1], [0.75, 1]) : interpolate(pop, [0, 1], [0.94, 1]);
  const vertical = height > width;
  const pos = { center: 0.5, lower: vertical ? 0.66 : 0.7, bottom: vertical ? 0.76 : 0.84 }[style.captionPosition] ?? 0.66;
  const size = u * (variant === 'viral' ? 8.2 : variant === 'kinetic' ? 7.4 : 5.8) * (style.captionSize || 1);
  const outline = variant === 'viral' ? size * 0.16 : size * 0.1;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute', left: '6%', right: '6%', top: top ?? `${pos * 100}%`, transform: `translateY(-50%) scale(${scale})`,
          display: 'flex', justifyContent: 'center', opacity: interpolate(pop, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' }),
        }}
      >
        <div
          style={{
            fontFamily: fontFamily(style.captionFont), fontWeight: fontWeight(style.captionFont), fontSize: size, lineHeight: 1.18,
            textAlign: 'center', textTransform: style.captionUppercase ? 'uppercase' : 'none', color: style.captionColor,
            ...(style.captionBoxed
              ? { background: 'rgba(0,0,0,0.72)', padding: `${size * 0.22}px ${size * 0.45}px`, borderRadius: size * 0.25 }
              : style.captionFont === 'playfair'
              ? { textShadow: `0 ${size * 0.05}px ${size * 0.3}px rgba(0,0,0,0.95), 0 0 ${size * 0.6}px rgba(0,0,0,0.6)` }
              : { WebkitTextStroke: `${outline}px #000`, paintOrder: 'stroke fill', textShadow: `0 ${size * 0.06}px ${size * 0.25}px rgba(0,0,0,0.55)` }),
            fontStyle: style.captionFont === 'playfair' ? 'italic' : 'normal', letterSpacing: style.captionFont === 'anton' ? '0.01em' : 0,
            maxWidth: '100%', overflowWrap: 'break-word',
          }}
        >
          {chunk.words.map((w, i) => {
            const active = t >= w.start - 0.02 && t < w.end + 0.05;
            const spoken = t >= w.start - 0.02;
            return (
              <span
                key={i}
                style={{
                  color: active ? style.highlightColor : undefined,
                  opacity: reveal && !spoken ? 0.25 : 1,
                  display: 'inline-block',
                  transform: active && variant === 'viral' ? 'scale(1.08)' : 'none',
                  margin: `0 ${size * 0.13}px`,
                }}
              >
                {w.text}
              </span>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ---------- Hình nền theo cảnh ----------

function Transition({ type, children, isFirst }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const len = Math.round(0.4 * fps);
  if (isFirst || type === 'cut') return <AbsoluteFill>{children}</AbsoluteFill>;
  const p = interpolate(frame, [0, len], [0, 1], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const styles = {
    fade: { opacity: p },
    slide: { transform: `translateX(${(1 - p) * 100}%)` },
    zoom: { opacity: p, transform: `scale(${1.35 - 0.35 * p})` },
    whip: { transform: `translateX(${(1 - p) * 100}%)`, filter: `blur(${(1 - p) * 24}px)` },
  };
  return <AbsoluteFill style={styles[type] || {}}>{children}</AbsoluteFill>;
}

function FallbackBackground({ index, accent }) {
  const frame = useCurrentFrame();
  const angle = 135 + frame * 0.3 + index * 40;
  return (
    <AbsoluteFill style={{ background: `linear-gradient(${angle}deg, ${accent} 0%, #1a1036 55%, #0b0b14 100%)` }} />
  );
}

function SceneVisual({ scene, style, durationInFrames }) {
  const frame = useCurrentFrame();
  const m = scene.media || { type: 'none' };
  const dir = scene.index % 2 ? -1 : 1;
  const prog = frame / Math.max(1, durationInFrames);
  let transform = 'none';
  if (style.kenBurns) {
    const s = m.type === 'image' ? 1.04 + 0.12 * prog : 1 + 0.05 * prog;
    const x = m.type === 'image' ? dir * (prog - 0.5) * 3 : 0;
    transform = `scale(${s}) translateX(${x}%)`;
  }
  const fill = { width: '100%', height: '100%', objectFit: 'cover', transform };
  if (m.type === 'video') return <OffthreadVideo src={m.src} muted style={fill} />;
  if (m.type === 'image') {
    return (
      <AbsoluteFill style={{ backgroundColor: '#000' }}>
        {/* Nền mờ để ảnh khác tỉ lệ khung vẫn đầy màn hình */}
        <Img src={m.src} style={{ ...fill, filter: 'blur(40px) brightness(0.6)', transform: 'scale(1.2)' }} />
        <AbsoluteFill>
          <Img src={m.src} style={{ ...fill, objectFit: 'contain' }} />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }
  return <FallbackBackground index={scene.index} accent={style.accentColor} />;
}

export function MediaTrack({ plan, extraFilter = '' }) {
  const { fps } = useVideoConfig();
  const t = useTime();
  const chunks = useChunks(plan);
  const { style } = plan;
  // Zoom giật: phóng to/thu nhỏ luân phiên theo từng cụm phụ đề (giống jump-cut).
  let punch = 1;
  if (style.zoomPunch) {
    const idx = chunkAt(chunks, t);
    punch = idx >= 0 && idx % 2 === 1 ? 1.1 : 1;
  }
  const filter = [GRADES[style.colorGrade] || 'none', extraFilter].filter((f) => f && f !== 'none').join(' ') || 'none';
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${punch})`, filter }}>
        {plan.scenes.map((s, i) => {
          const from = Math.round(s.start * fps);
          const isLast = i === plan.scenes.length - 1;
          const dur = Math.max(1, Math.round((s.duration + (isLast ? 0 : s.overlap || 0)) * fps));
          return (
            <Sequence key={i} from={from} durationInFrames={dur} name={`Cảnh ${i + 1}`}>
              <Transition type={style.transition} isFirst={i === 0}>
                <SceneVisual scene={s} style={style} durationInFrames={dur} />
              </Transition>
            </Sequence>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ---------- Âm thanh ----------

export function AudioTracks({ plan, popOnText = true }) {
  const { fps, durationInFrames } = useVideoConfig();
  const { style, sfx = {} } = plan;
  const fadeOut = Math.round(1.2 * fps);
  return (
    <>
      {plan.scenes.map((s, i) =>
        s.voice ? (
          <Sequence key={`v${i}`} from={Math.round(s.start * fps)} name={`Giọng ${i + 1}`}>
            <Audio src={s.voice} />
          </Sequence>
        ) : null,
      )}
      {plan.music ? (
        <Audio
          src={plan.music}
          loop
          volume={(f) => interpolate(f, [0, 10, durationInFrames - fadeOut, durationInFrames], [0, style.musicVolume, style.musicVolume, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
        />
      ) : null}
      {style.sfx && sfx.whoosh && style.transition !== 'cut'
        ? plan.scenes.slice(1).map((s, i) => (
            <Sequence key={`w${i}`} from={Math.max(0, Math.round((s.start - 0.15) * fps))} durationInFrames={Math.round(fps)}>
              <Audio src={sfx.whoosh} volume={0.35} />
            </Sequence>
          ))
        : null}
      {style.sfx && sfx.pop && popOnText
        ? plan.scenes.filter((s) => s.onScreenText).map((s, i) => (
            <Sequence key={`p${i}`} from={Math.round((s.start + 0.1) * fps)} durationInFrames={Math.round(fps)}>
              <Audio src={sfx.pop} volume={0.4} />
            </Sequence>
          ))
        : null}
      {style.sfx && sfx.ding && style.showCta && plan.cta?.text ? (
        <Sequence from={Math.round((plan.scenes[plan.scenes.length - 1].start + 0.2) * fps)} durationInFrames={Math.round(1.5 * fps)}>
          <Audio src={sfx.ding} volume={0.4} />
        </Sequence>
      ) : null}
    </>
  );
}

// ---------- Phụ kiện hay dùng ----------

export function ProgressBar({ color, position = 'top' }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const u = useUnit();
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, [position]: 0, height: u * 0.9, background: 'rgba(255,255,255,0.25)' }}>
      <div style={{ width: `${(frame / durationInFrames) * 100}%`, height: '100%', background: color }} />
    </div>
  );
}

export function PopIn({ at = 0, children, style, from = 'scale' }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - Math.round(at * fps), fps, config: { damping: 13, stiffness: 180 } });
  const transform =
    from === 'left' ? `translateX(${(1 - p) * -120}%)` : from === 'up' ? `translateY(${(1 - p) * 60}%)` : `scale(${0.4 + 0.6 * p})`;
  return <div style={{ ...style, transform: `${style?.transform || ''} ${transform}`, opacity: Math.min(1, p * 1.5) }}>{children}</div>;
}

// Hiện trong khoảng thời gian của cảnh (giây tuyệt đối).
export function During({ scene, children, from = 0, to }) {
  const { fps } = useVideoConfig();
  const start = Math.round((scene.start + from) * fps);
  const end = Math.round((to ?? scene.start + scene.duration) * fps);
  return (
    <Sequence from={start} durationInFrames={Math.max(1, end - start)} layout="none">
      {children}
    </Sequence>
  );
}

export function CtaButton({ plan, u, top = '42%' }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pulse = 1 + 0.05 * Math.sin((frame / fps) * Math.PI * 2.2);
  const { cta, style } = plan;
  if (!style.showCta || !cta?.text) return null;
  const last = plan.scenes[plan.scenes.length - 1];
  return (
    <During scene={last} from={0.2}>
      <AbsoluteFill style={{ alignItems: 'center' }}>
        <PopIn at={0} style={{ position: 'absolute', top, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: u * 1.5 }}>
          <div
            style={{
              transform: `scale(${pulse})`, background: style.accentColor, color: '#fff', fontFamily: fontFamily('montserrat'), fontWeight: 800,
              fontSize: u * 6, padding: `${u * 2}px ${u * 6}px`, borderRadius: u * 10, boxShadow: `0 ${u}px ${u * 4}px rgba(0,0,0,0.45)`,
              textTransform: 'uppercase', whiteSpace: 'nowrap',
            }}
          >
            {cta.text} 👉
          </div>
          {cta.sub ? (
            <div style={{ fontFamily: fontFamily('be-vietnam'), fontWeight: 800, fontSize: u * 3.6, color: '#fff', background: 'rgba(0,0,0,0.65)', padding: `${u * 0.6}px ${u * 2}px`, borderRadius: u * 3 }}>
              {cta.sub}
            </div>
          ) : null}
        </PopIn>
      </AbsoluteFill>
    </During>
  );
}
