// 7 template edit. Mỗi template ghép các lớp dùng chung (core.jsx) theo bố cục riêng.
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  MediaTrack, Captions, AudioTracks, ProgressBar, PopIn, During, CtaButton, useUnit,
} from '../components/core.jsx';
import { fontFamily } from '../fonts.js';

const useIsVertical = () => {
  const { width, height } = useVideoConfig();
  return height > width;
};

// Chữ trên màn hình theo từng cảnh (dạng nhãn bật lên).
function SceneLabels({ plan, render, skipFirst = false, skipLast = false }) {
  const n = plan.scenes.length;
  if (!plan.style.showOnScreenText) return null;
  return plan.scenes.map((s, i) => {
    if (!s.onScreenText || (skipFirst && i === 0) || (skipLast && i === n - 1)) return null;
    return (
      <During key={i} scene={s} from={0.1}>
        {render(s, i)}
      </During>
    );
  });
}

// 🔥 Phụ đề Viral
function ViralCaptions({ plan }) {
  const u = useUnit();
  const first = plan.scenes[0];
  const vertical = useIsVertical();
  return (
    <AbsoluteFill>
      <MediaTrack plan={plan} />
      {plan.headline && first ? (
        <During scene={first} from={0}>
          <AbsoluteFill style={{ alignItems: 'center' }}>
            <PopIn
              style={{
                position: 'absolute', top: vertical ? '14%' : '8%', maxWidth: '84%', background: '#fff', color: '#111',
                fontFamily: fontFamily('montserrat'), fontWeight: 800, fontSize: u * 5.4, lineHeight: 1.2, textAlign: 'center',
                padding: `${u * 1.6}px ${u * 3}px`, borderRadius: u * 1.6, transform: 'rotate(-2deg)', boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
              }}
            >
              {plan.headline}
            </PopIn>
          </AbsoluteFill>
        </During>
      ) : null}
      <SceneLabels
        plan={plan}
        skipFirst
        skipLast
        render={(s) => (
          <AbsoluteFill style={{ alignItems: 'center' }}>
            <PopIn
              style={{
                position: 'absolute', top: vertical ? '16%' : '10%', background: plan.style.accentColor, color: '#fff',
                fontFamily: fontFamily('montserrat'), fontWeight: 800, fontSize: u * 4.2, padding: `${u}px ${u * 2.6}px`, borderRadius: u * 1.2,
                textTransform: 'uppercase', maxWidth: '84%', textAlign: 'center',
              }}
            >
              {s.onScreenText}
            </PopIn>
          </AbsoluteFill>
        )}
      />
      <Captions plan={plan} variant="viral" />
      <CtaButton plan={plan} u={u} top={vertical ? '20%' : '14%'} />
      {plan.style.progressBar ? <ProgressBar color={plan.style.highlightColor} /> : null}
      <AudioTracks plan={plan} />
    </AbsoluteFill>
  );
}

// 📌 Tiêu đề Hook cố định
function HookHeadline({ plan }) {
  const u = useUnit();
  const vertical = useIsVertical();
  const barH = vertical ? 24 : 18;
  const len = (plan.headline || '').length;
  const size = u * (len > 70 ? 4.6 : len > 45 ? 5.6 : len > 28 ? 6.6 : 7.6) * (vertical ? 1 : 0.85);
  return (
    <AbsoluteFill style={{ background: '#fff' }}>
      <div style={{ position: 'absolute', top: `${barH}%`, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
        <MediaTrack plan={plan} />
      </div>
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: `${barH}%`, display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: `0 ${u * 5}px`, background: '#fff',
        }}
      >
        <PopIn
          style={{
            fontFamily: fontFamily('be-vietnam'), fontWeight: 800, fontSize: size, lineHeight: 1.22, color: '#111', textAlign: 'center',
          }}
        >
          {plan.headline}
          <div style={{ height: u * 0.9, width: '30%', margin: `${u * 1.4}px auto 0`, background: plan.style.accentColor, borderRadius: u }} />
        </PopIn>
      </div>
      <Captions plan={plan} />
      {plan.brand ? (
        <div style={{ position: 'absolute', top: `${barH + 2}%`, right: '4%', color: '#fff', fontFamily: fontFamily('be-vietnam'), fontWeight: 800, fontSize: u * 3, opacity: 0.85, textShadow: '0 2px 8px #000' }}>
          {plan.brand}
        </div>
      ) : null}
      <CtaButton plan={plan} u={u} top={vertical ? '40%' : '45%'} />
      {plan.style.progressBar ? <ProgressBar color={plan.style.accentColor} position="bottom" /> : null}
      <AudioTracks plan={plan} popOnText={false} />
    </AbsoluteFill>
  );
}

// 🛍️ Review / Bán hàng
function ProductReview({ plan }) {
  const u = useUnit();
  const vertical = useIsVertical();
  return (
    <AbsoluteFill>
      <MediaTrack plan={plan} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.45) 100%)' }} />
      {plan.brand ? (
        <div style={{ position: 'absolute', top: '5%', left: '5%', background: '#fff', color: '#111', fontFamily: fontFamily('montserrat'), fontWeight: 800, fontSize: u * 3.2, padding: `${u * 0.8}px ${u * 2}px`, borderRadius: u * 5 }}>
          {plan.brand}
        </div>
      ) : null}
      <SceneLabels
        plan={plan}
        skipLast
        render={(s, i) => (
          <PopIn
            from="left"
            style={{
              position: 'absolute', left: '5%', top: vertical ? '22%' : '14%', maxWidth: '80%', display: 'flex', alignItems: 'center',
              gap: u * 1.5, background: '#fff', borderRadius: u * 2, padding: `${u * 1.4}px ${u * 2.6}px`,
              boxShadow: '0 12px 30px rgba(0,0,0,0.35)', borderLeft: `${u * 1.2}px solid ${plan.style.accentColor}`,
            }}
          >
            <span style={{ fontFamily: fontFamily('montserrat'), fontWeight: 800, fontSize: u * (i === 0 ? 5.4 : 4.4), color: '#111', lineHeight: 1.15 }}>
              {i === 0 ? '' : '✓ '}
              {s.onScreenText}
            </span>
          </PopIn>
        )}
      />
      <Captions plan={plan} />
      <CtaButton plan={plan} u={u} top={vertical ? '36%' : '30%'} />
      {plan.style.progressBar ? <ProgressBar color={plan.style.accentColor} /> : null}
      <AudioTracks plan={plan} />
    </AbsoluteFill>
  );
}

// 🔢 Top / Danh sách
function Listicle({ plan }) {
  const u = useUnit();
  const vertical = useIsVertical();
  const items = plan.scenes.filter((s, i) => i > 0 && !/cta/i.test(s.role) && i < plan.scenes.length - (plan.cta?.text ? 1 : 0));
  return (
    <AbsoluteFill>
      <MediaTrack plan={plan} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 35%)' }} />
      {plan.scenes[0] ? (
        <During scene={plan.scenes[0]}>
          <AbsoluteFill style={{ alignItems: 'center' }}>
            <PopIn
              style={{
                position: 'absolute', top: vertical ? '15%' : '10%', maxWidth: '86%', textAlign: 'center', color: '#fff',
                fontFamily: fontFamily('montserrat'), fontWeight: 800, fontSize: u * 6.4, lineHeight: 1.15, textTransform: 'uppercase',
                textShadow: '0 4px 20px rgba(0,0,0,0.8)',
              }}
            >
              {plan.headline || plan.scenes[0].onScreenText}
            </PopIn>
          </AbsoluteFill>
        </During>
      ) : null}
      {items.map((s, k) => (
        <During key={s.index} scene={s} from={0.05}>
          <PopIn
            from="left"
            style={{ position: 'absolute', left: '5%', top: vertical ? '13%' : '9%', right: '5%', display: 'flex', alignItems: 'center', gap: u * 2.4 }}
          >
            <div
              style={{
                minWidth: u * 14, height: u * 14, borderRadius: '50%', background: plan.style.accentColor, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fontFamily('anton'), fontSize: u * 9,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}
            >
              {k + 1}
            </div>
            {s.onScreenText ? (
              <div style={{ color: '#fff', fontFamily: fontFamily('montserrat'), fontWeight: 800, fontSize: u * 5, lineHeight: 1.15, textShadow: '0 3px 14px rgba(0,0,0,0.9)' }}>
                {s.onScreenText}
              </div>
            ) : null}
          </PopIn>
        </During>
      ))}
      <Captions plan={plan} />
      <CtaButton plan={plan} u={u} top={vertical ? '34%' : '30%'} />
      {plan.style.progressBar ? <ProgressBar color={plan.style.accentColor} position="bottom" /> : null}
      <AudioTracks plan={plan} />
    </AbsoluteFill>
  );
}

// 🎬 Kể chuyện điện ảnh
function CinematicStory({ plan }) {
  const u = useUnit();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vertical = useIsVertical();
  const bar = vertical ? 7 : 10;
  const intro = interpolate(frame, [0, fps * 0.8], [0, 1], { extrapolateRight: 'clamp' });
  const first = plan.scenes[0];
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <MediaTrack plan={plan} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.6) 100%)' }} />
      {first && (plan.headline || first.onScreenText) ? (
        <During scene={first} from={0.3}>
          <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
            <PopIn
              from="up"
              style={{
                maxWidth: '82%', textAlign: 'center', color: '#fff', fontFamily: fontFamily('playfair'), fontStyle: 'italic',
                fontWeight: 600, fontSize: u * 7, lineHeight: 1.2, textShadow: '0 4px 30px rgba(0,0,0,0.9)',
              }}
            >
              {plan.headline || first.onScreenText}
            </PopIn>
          </AbsoluteFill>
        </During>
      ) : null}
      <Captions plan={plan} top={vertical ? '80%' : '78%'} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${bar * intro}%`, background: '#000' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${bar * intro}%`, background: '#000' }} />
      {plan.brand ? (
        <div style={{ position: 'absolute', bottom: `${bar / 3}%`, width: '100%', textAlign: 'center', color: '#d8c7a0', fontFamily: fontFamily('playfair'), fontSize: u * 2.6, letterSpacing: '0.3em', textTransform: 'uppercase' }}>
          {plan.brand}
        </div>
      ) : null}
      <CtaButton plan={plan} u={u} top="40%" />
      <AudioTracks plan={plan} popOnText={false} />
    </AbsoluteFill>
  );
}

// 📰 Tin nhanh / Kiến thức
function NewsBrief({ plan }) {
  const u = useUnit();
  const frame = useCurrentFrame();
  const vertical = useIsVertical();
  const t = useVideoConfig();
  const ticker = `${plan.headline || ''}   •   ${plan.cta?.text || ''} ${plan.cta?.sub || ''}   •   `.repeat(4);
  const label = plan.brand || 'TIN NHANH';
  const lowerTop = vertical ? 64 : 70;
  return (
    <AbsoluteFill>
      <MediaTrack plan={plan} />
      <div style={{ position: 'absolute', top: '4%', left: '4%', display: 'flex', alignItems: 'center', gap: u, fontFamily: fontFamily('oswald'), fontWeight: 600, color: '#fff', fontSize: u * 3.2 }}>
        <span style={{ width: u * 2, height: u * 2, borderRadius: '50%', background: plan.style.accentColor, opacity: Math.floor(frame / (t.fps / 2)) % 2 ? 0.3 : 1 }} />
        <span style={{ textShadow: '0 2px 8px #000' }}>{label}</span>
      </div>
      {plan.scenes.map((s) =>
        s.onScreenText || plan.headline ? (
          <During key={s.index} scene={s}>
            <PopIn from="left" style={{ position: 'absolute', left: 0, top: `${lowerTop}%`, maxWidth: '92%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ alignSelf: 'flex-start', background: plan.style.accentColor, color: '#fff', fontFamily: fontFamily('oswald'), fontWeight: 600, fontSize: u * 3, padding: `${u * 0.5}px ${u * 2}px`, textTransform: 'uppercase' }}>
                {label}
              </div>
              <div style={{ background: '#fff', color: '#111', fontFamily: fontFamily('oswald'), fontWeight: 600, fontSize: u * 4.6, padding: `${u * 1}px ${u * 2}px`, lineHeight: 1.15, textTransform: 'uppercase' }}>
                {s.onScreenText || plan.headline}
              </div>
            </PopIn>
          </During>
        ) : null,
      )}
      <Captions plan={plan} top={vertical ? '40%' : '42%'} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: vertical ? '14%' : '3%', height: u * 5.2, background: '#111', overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
        <div style={{ whiteSpace: 'nowrap', color: '#fff', fontFamily: fontFamily('oswald'), fontWeight: 600, fontSize: u * 3, transform: `translateX(${-frame * u * 0.5}px)` }}>{ticker}</div>
      </div>
      <CtaButton plan={plan} u={u} top="18%" />
      {plan.style.progressBar ? <ProgressBar color={plan.style.accentColor} /> : null}
      <AudioTracks plan={plan} popOnText={false} />
    </AbsoluteFill>
  );
}

// ✍️ Chữ động
function KineticText({ plan }) {
  const u = useUnit();
  const vertical = useIsVertical();
  return (
    <AbsoluteFill>
      <MediaTrack plan={plan} extraFilter="blur(8px)" />
      <SceneLabels
        plan={plan}
        render={(s) => (
          <AbsoluteFill style={{ alignItems: 'center' }}>
            <PopIn
              style={{
                position: 'absolute', top: vertical ? '22%' : '14%', color: plan.style.highlightColor, fontFamily: fontFamily('montserrat'),
                fontWeight: 800, fontSize: u * 3.6, letterSpacing: '0.12em', textTransform: 'uppercase', textAlign: 'center', maxWidth: '84%',
              }}
            >
              {s.onScreenText}
            </PopIn>
          </AbsoluteFill>
        )}
      />
      <Captions plan={plan} variant="kinetic" reveal />
      <CtaButton plan={plan} u={u} top={vertical ? '66%' : '68%'} />
      {plan.style.progressBar ? <ProgressBar color={plan.style.highlightColor} /> : null}
      <AudioTracks plan={plan} />
    </AbsoluteFill>
  );
}

export const TEMPLATE_COMPONENTS = {
  'viral-captions': ViralCaptions,
  'hook-headline': HookHeadline,
  'product-review': ProductReview,
  listicle: Listicle,
  'cinematic-story': CinematicStory,
  'news-brief': NewsBrief,
  'kinetic-text': KineticText,
};
