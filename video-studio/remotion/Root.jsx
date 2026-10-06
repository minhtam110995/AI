import React from 'react';
import { AbsoluteFill, Composition } from 'remotion';
import './fonts.js';
import { TEMPLATE_COMPONENTS } from './templates/index.jsx';
import { resolveStyle } from './templates/catalog.js';
import { samplePlan } from './sample-plan.js';

function Main(plan) {
  const Template = TEMPLATE_COMPONENTS[plan.template] || TEMPLATE_COMPONENTS['viral-captions'];
  const style = resolveStyle(plan.template, plan.style);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Template plan={{ ...plan, style }} />
    </AbsoluteFill>
  );
}

// Kích thước/thời lượng lấy từ "plan" do server tạo ra.
export const Root = () => (
  <Composition
    id="Main"
    component={Main}
    defaultProps={samplePlan}
    durationInFrames={samplePlan.durationInFrames}
    fps={samplePlan.fps}
    width={samplePlan.width}
    height={samplePlan.height}
    calculateMetadata={({ props }) => ({
      durationInFrames: Math.max(1, props.durationInFrames),
      fps: props.fps,
      width: props.width,
      height: props.height,
    })}
  />
);
