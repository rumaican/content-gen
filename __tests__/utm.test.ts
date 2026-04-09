/**
 * __tests__/utm.test.ts
 * TDD: GAP-1 UTM Parameter Tracking
 *
 * Tests the UTM utility module:
 * 1. Build UTM-tagged URLs for marketing links
 * 2. Parse/capture UTM params from incoming URLs
 * 3. Validate UTM param shapes
 */

import { describe, it, expect } from 'vitest';
import {
  buildUtmUrl,
  parseUtmParams,
  captureUtmFromUrl,
  isValidUtmSource,
  type UtmParams,
} from '../src/lib/utm.js';

describe('UTM Parameter Tracking', () => {

  describe('buildUtmUrl', () => {
    it('test_build_utm_url_adds_all_utm_params', () => {
      const base = 'https://cartographyprints.com/shop';
      const result = buildUtmUrl(base, {
        source: 'instagram',
        medium: 'social',
        campaign: 'spring-sale',
        term: 'map-print',
        content: 'hero-link',
      });

      expect(result).toContain('utm_source=instagram');
      expect(result).toContain('utm_medium=social');
      expect(result).toContain('utm_campaign=spring-sale');
      expect(result).toContain('utm_term=map-print');
      expect(result).toContain('utm_content=hero-link');
    });

    it('test_build_utm_url_encodes_special_characters', () => {
      const base = 'https://cartographyprints.com/shop';
      const result = buildUtmUrl(base, {
        source: 'pinterest',
        medium: 'social',
        campaign: 'spring %20 sale',
      });

      expect(result).toContain('utm_campaign=');
      // Spaces should be encoded
      expect(result).not.toMatch(/utm_campaign=spring sale/);
    });

    it('test_build_utm_url_handles_missing_optional_params', () => {
      const base = 'https://cartographyprints.com/product/city-map';
      const result = buildUtmUrl(base, {
        source: 'email',
        medium: 'email',
        campaign: 'welcome-series',
      });

      expect(result).toContain('utm_source=email');
      expect(result).toContain('utm_medium=email');
      expect(result).toContain('utm_campaign=welcome-series');
      expect(result).not.toContain('utm_term');
      expect(result).not.toContain('utm_content');
    });

    it('test_build_utm_url_preserves_existing_query_params', () => {
      const base = 'https://cartographyprints.com/shop?ref=header';
      const result = buildUtmUrl(base, {
        source: 'newsletter',
        medium: 'email',
        campaign: 'weekly-update',
      });

      expect(result).toContain('ref=header');
      expect(result).toContain('utm_source=newsletter');
    });
  });

  describe('parseUtmParams', () => {
    it('test_parse_utm_params_extracts_all_fields', () => {
      const url = 'https://cartographyprints.com/checkout?utm_source=instagram&utm_medium=social&utm_campaign=spring-sale&utm_term=map-poster&utm_content=cta-button';
      const params = parseUtmParams(url);

      expect(params.source).toBe('instagram');
      expect(params.medium).toBe('social');
      expect(params.campaign).toBe('spring-sale');
      expect(params.term).toBe('map-poster');
      expect(params.content).toBe('cta-button');
    });

    it('test_parse_utm_params_handles_partial_params', () => {
      const url = 'https://cartographyprints.com/checkout?utm_source=pinterest&utm_medium=social&utm_campaign=summer';
      const params = parseUtmParams(url);

      expect(params.source).toBe('pinterest');
      expect(params.medium).toBe('social');
      expect(params.campaign).toBe('summer');
      expect(params.term).toBeNull();
      expect(params.content).toBeNull();
    });

    it('test_parse_utm_params_returns_null_fields_when_absent', () => {
      const url = 'https://cartographyprints.com/checkout';
      const params = parseUtmParams(url);

      expect(params.source).toBeNull();
      expect(params.medium).toBeNull();
      expect(params.campaign).toBeNull();
      expect(params.term).toBeNull();
      expect(params.content).toBeNull();
    });

    it('test_parse_utm_params_decodes_encoded_values', () => {
      const url = 'https://cartographyprints.com/checkout?utm_source=email&utm_medium=email&utm_campaign=spring%20sale%202026';
      const params = parseUtmParams(url);

      expect(params.campaign).toBe('spring sale 2026');
    });
  });

  describe('captureUtmFromUrl', () => {
    it('test_capture_utm_from_url_returns_utm_object', () => {
      const url = 'https://cartographyprints.com/checkout?utm_source=instagram&utm_medium=social&utm_campaign=spring-sale';
      const captured = captureUtmFromUrl(url);

      expect(captured).toBeDefined();
      expect(captured?.source).toBe('instagram');
      expect(captured?.medium).toBe('social');
      expect(captured?.campaign).toBe('spring-sale');
    });

    it('test_capture_utm_from_url_returns_null_when_no_utm', () => {
      const url = 'https://cartographyprints.com/checkout';
      const captured = captureUtmFromUrl(url);

      expect(captured).toBeNull();
    });

    it('test_capture_utm_from_url_requires_source', () => {
      // Has medium and campaign but no source — should return null
      const url = 'https://cartographyprints.com/checkout?utm_medium=social&utm_campaign=spring-sale';
      const captured = captureUtmFromUrl(url);

      expect(captured).toBeNull();
    });
  });

  describe('isValidUtmSource', () => {
    it('test_is_valid_utm_source_accepts_known_sources', () => {
      const validSources = ['instagram', 'pinterest', 'email', 'facebook', 'twitter', 'google', 'newsletter', 'direct'];
      for (const source of validSources) {
        expect(isValidUtmSource(source)).toBe(true);
      }
    });

    it('test_is_valid_utm_source_rejects_empty_or_invalid', () => {
      expect(isValidUtmSource('')).toBe(false);
      expect(isValidUtmSource('   ')).toBe(false);
      expect(isValidUtmSource('unknown-source')).toBe(false);
    });
  });

  describe('UtmParams type completeness', () => {
    it('test_utm_params_type_has_all_required_fields', () => {
      const params: UtmParams = {
        source: 'instagram',
        medium: 'social',
        campaign: 'test-campaign',
        term: 'map-print',
        content: 'hero-cta',
      };

      expect(params.source).toBe('instagram');
      expect(params.medium).toBe('social');
      expect(params.campaign).toBe('test-campaign');
      expect(params.term).toBe('map-print');
      expect(params.content).toBe('hero-cta');
    });
  });
});
