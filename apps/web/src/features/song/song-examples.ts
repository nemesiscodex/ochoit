export type SongExample = {
  id: string;
  name: string;
  author: string;
  summary: string;
  dsl: string;
};

export const songExamples: readonly SongExample[] = [
  {
    id: "mario-theme",
    name: "Mario Theme",
    author: "nemesiscodex",
    summary: "A built-in reference arrangement with the main melody, harmony, bass, noise pulse, and PCM support.",
    dsl: `!v=3;bpm=97;loop=64;spb=4;mode=i;mv=88;name=Mario%20Theme;author=nemesiscodex;created=2026-03-18T00:00:00.000Z;updated=2026-03-21T02:25:54.388Z
=1;vol=100;mute=0
1:E6~84
2:E6~84
4:E6~84
6:C6~84
7:E6~84
9:G6~84
13:G5~84
17:C6
20:G5
23:E5
26:A5
28:B5
30:A#5
31:A5
33:G5
34:E6
36:G6
37:A6
39:F6
40:G6
42:E6
44:C6
45:D6
46:B5
49:C6
50:C6
52:C6
54:C6
55:D6
57:E6
58:C6
60:A5
61:G5
=2;vol=100;mute=0
1:E5~76
2:E5~76
4:E5~76
6:C5~76
7:E5~76
9:G5~76
13:G4~76
17:C5
20:G4
23:E4
26:A4
28:B4
30:A#4
31:A4
33:G4
34:E5
36:G5
37:A5
39:F5
40:G5
42:E5
44:C5
45:D5
46:B4
49:G#5
50:G#5
52:G#5
54:G#5
55:A#5
57:G5
58:E5
60:E5
61:C5
=3;vol=100;mute=0
1:D4~78
2:D4~78
4:D4~78
7:D4~78
9:G4~78
13:G3~78
17:C4
20:G3
23:E3
26:A3
28:B3
30:A#3
31:A3
33:G3
34:E4
36:G4
37:A4
39:F4
40:G4
42:E4
44:C4
45:D4
46:B3
49:C5
50:C5
52:C5
54:C5
55:D#5
57:E5
58:C5
60:A4
61:G4
=4;vol=62;mute=0
1:long P5~68
2:long P5~68
4:long P5~68
7:long P5~68
9:long P5~68
13:long P5~68
17:long P5~100
20:long P5~100
23:long P5~100
26:long P5~100
30:long P5~100
33:long P5~100
34:long P5~100
36:long P5~100
39:long P5~100
42:long P5~100
45:long P5~100
46:long P5~100
49:long P5~61
51:long P5~100
52:long P5~100
54:long P5~100
55:long P5~100
57:long P5~100
60:long P5~100
63:long P5~100
64:long P5~100
=5;vol=100;mute=0
1:mic-001>E2~74
2:mic-001>E2~74
4:mic-001>E2~74
7:mic-001>E2~74
9:mic-001>G2~74
13:mic-001>G1~74
17:mic-001>C2
20:mic-001>G2
23:mic-001>E1
26:mic-001>A1
28:mic-001>B1
30:mic-001>A#1
31:mic-001>A1
33:mic-001>G1
34:mic-001>E2
36:mic-001>G2
37:mic-001>A2
39:mic-001>F2
40:mic-001>G2
42:mic-001>E2
44:mic-001>C2
45:mic-001>D2
46:mic-001>B1
49:mic-001>G#3
52:mic-001>D#4
55:mic-001>G#4
57:mic-001>G4
60:mic-001>C4
63:mic-001>G3
$mic-001|mic-001|m|C4||11025|0|475|AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP8BAAAAAAAAAf8AAAEAAAAAAQAAAAAAAAD_AAAAAAwG6iLSEeUQDQT_4REBF-z59RAL8_jxHfcM5gAYAA_TC_Yg7vT3DB73-OITBAzu9wgODev--Rf99vP6Gv4K5AoDDfztBP8X8f_3DQb7-vkPAwXwAAMJ_fIF_RX1AfYICvj-8RADB_P-CAkB8f0AEP779gQNAP3uCgIL9fcDBgzy_fkOBf31_gsEAPIBAwn-9_8CDPv-9wgD__v6CgAF9QIBBf_3AgEI-__9BgL9-_0HAgP3AAIFAPgB_gv8_voDBgD--QMEBPv8_wQF-_77BwEB_P4EAAL5Av8F_v4AAAP9AP0DAf_-_wMAAPsCAAP-_QEABfsB_AYAAPwABAEB-wACAwD7AAAF___8AwMA_vsEAQX8__4EA_7-_gYAAfwAAgIB_AH_BQD-_gAD_wD8AgEC__4CAAL9Af8D__8AAAP-AP0CAQD__gMAAvwAAAMA_v8AA_8A_QIBAv7-AQED_f__AgL-AP4EAAD8AQECAP0AAQIA_QAAA_8A_gIAAv7_AQAB_gD_Av____8B___-AAAA__4BAAH-_w`,
  },
];

export function getSongExampleById(exampleId: string) {
  return songExamples.find((example) => example.id === exampleId) ?? null;
}
