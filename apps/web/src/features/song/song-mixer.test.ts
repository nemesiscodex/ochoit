import { describe, expect, it } from "vitest";

import { toTrackVolumePercent } from "@/features/song/song-mixer";

describe("song-mixer", () => {
  it("shows track volumes as clamped whole percentages", () => {
    expect(toTrackVolumePercent(0.456)).toBe(46);
    expect(toTrackVolumePercent(-0.3)).toBe(0);
    expect(toTrackVolumePercent(1.8)).toBe(100);
  });
});
