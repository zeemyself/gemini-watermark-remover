import test from 'node:test';
import assert from 'node:assert/strict';

import { selectInitialCandidate } from '../../src/core/candidateSelector.js';
import { createPatternImageData } from './syntheticWatermarkTestUtils.js';

test('selectInitialCandidate should return a skipped result when no standard trials can be built', () => {
    const imageData = createPatternImageData(456, 142);
    const config = {
        logoSize: 125,
        marginRight: 32,
        marginBottom: 32
    };
    const position = {
        x: imageData.width - config.marginRight - config.logoSize,
        y: imageData.height - config.marginBottom - config.logoSize,
        width: config.logoSize,
        height: config.logoSize
    };

    const result = selectInitialCandidate({
        originalImageData: imageData,
        config,
        position,
        alpha48: null,
        alpha96: null,
        getAlphaMap: () => null,
        allowAdaptiveSearch: false,
        alphaGainCandidates: [1]
    });

    assert.equal(result.selectedTrial, null);
    assert.equal(result.source, 'skipped');
    assert.equal(result.decisionTier, 'insufficient');
    assert.equal(result.standardSpatialScore, null);
    assert.equal(result.standardGradientScore, null);
});
