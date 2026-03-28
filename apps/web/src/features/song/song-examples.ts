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
  {
    id: "mario-underwater",
    name: "Mario Underwater",
    author: "nemesiscodex",
    summary: "A slower underwater groove with layered pulse melodies, walking harmony, and soft noise accents.",
    dsl: `!v=3;bpm=97;loop=64;spb=4;mode=i;mv=43;spk=0;name=Mario%20Underwater;author=nemesiscodex;created=2026-03-18T00:00:00.000Z;updated=2026-03-21T18:25:14.397Z
=1;vol=84;mute=0
1:D4
2-3:F4
4-5:F#4
6-7:G4
8-9:A4
10-11:A#4
12:B4
13:B4
14:B4
16:B4
18-21:B4
24-28:E5
30-34:D#5
36-40:E5
43:G4
44:A4
45:B4
46:C5
47:D5
48-52:E5
54-57:D#5
58-59:F5
60-64:E5
=2;vol=76;mute=0
1:D4~84
2-3:C#4~84
4-5:C4~84
6-7:B3~84
8-9:C4~84
10-11:C#4~84
12:D4~84
13:D4~84
14:D4~84
16:E4~84
18-21:F4
22:G4
24-28:G4
30-34:F#4
36-40:G4
43:G4
44:A4
45:B4
46:C5
47:D5
48-52:G4
54-57:F#4
58-59:A4
60-64:G4
=3;vol=78;mute=0
17:G3
19-21:G3
22-23:G3
24:C3
26:G3
28:C4
30:B2
32:G3
34:B3
36:C3
38:G3
40:C4
42:E3
44:G3
46:C4
48:C3
50:G3
52:C4
54:B2
56:G3
58:B3
60:C3
62:G3
64:C4
=4;vol=45;mute=0
3:short P1~81
5:long P5~82
9:short P1~82
10:short P1~78
11:long P5~78
15:short P1~58
17:long P5~68
21:short P1~68
22:short P1~68
23:long P5~68
27:short P1~68
29:long P5~68
33:short P1~68
34:short P1~68
35:long P5~68
39:short P1~68
41:long P5~68
45:short P1~68
46:short P1~68
47:long P5~68
51:short P1~68
53:long P5~68
57:short P1~68
58:short P1~68
59:long P5~68
64:short P1~68
=5;vol=74;mute=0`,
  },
  {
    id: "zelda-medley",
    name: "Zelda Medley",
    author: "nemesiscodex",
    summary: "A faster medley with stacked pulse leads, a driving bassline, and steady long-noise percussion.",
    dsl: `!v=3;bpm=140;loop=128;spb=4;mode=i;mv=88;spk=1;name=Zelda%20Medley;author=nemesiscodex;created=2026-03-18T00:00:00.000Z;updated=2026-03-28T03:54:04.862Z
=1;vol=84;mute=0
1:F6
3:F5
4:F5
5:F5
7:F5
8:F5
9:F5
11:F5
12:F5
13:F5
15:F5
17:A#5
21:F5
28:A#5
29:A#5
30:C6
31:D6
32:D#6
33:F6
36:A#5
37:A#5
38:C6
39:D6
40:D#6
41:F6
43:F6
45:F6
46:F#6
48:G#6
49:A#6
58:A#6
60:A#6
61:A#6
62:G#6
64:F#6
65:G#6
68:F#6
69:F6
77:F6
81:D#6
83:D#6
84:F6
85:F#6
93:F6
95:D#6
97:C#6
99:C#6
100:D#6
101:F6
109:D#6
111:C#6
113:C6
115:C6
116:D6
117:E6
125:G6
=2;vol=76;mute=0
3:A4~84
4:A4~84
5:A4~84
7:A4~84
8:A4~84
9:A4~84
11:A4~84
12:A4~84
13:A4~84
15:A4~84
17:D5
21:D5
23:D5
24:C5
25:D5
28:D5
29:D5
30:D#5
31:F5
32:G5
33:G#5
45:G#5
46:A#5
48:C6
49:C#6
52:F#5
53:F#5
54:G#5
55:A#5
56:C6
57:C#6
60:C#6
61:C#6
62:C6
64:A#5
65:C#6
68:G#5
69:G#5
70:G#5
72:F#5
73:G#5
75:G#5
77:G#5
78:F#5
80:G#5
81:F#5
83:F#5
84:F5
85:F#5
87:F#5
88:G#5
89:A#5
93:G#5
95:F#5
97:F5
99:F5
100:D#5
101:F5
103:F5
104:F#5
105:G#5
109:F#5
111:F5
113:E5
115:E5
116:D5
117:E5
119:E5
120:F5
121:G5
123:G5
124:A5
125:A#5
127:C6
=3;vol=28;mute=0
1:A#3~78
5:A#3~78
6:A#3~78
8:A#3~78
9:A#3~78
13:A#3~78
14:A#3~78
16:A#3~78
17:G#3~78
21:G#3~78
22:G#3~78
24:G#3~78
25:G#3~78
29:G#3~78
30:G#3~78
32:G#3~78
33:F#3~78
37:F#3~78
38:F#3~78
40:F#3~78
41:F#3~78
45:F#3~78
46:F#3~78
48:F#3~78
49:F3~78
53:F3~78
57:F3~78
61:G3~78
63:A3~78
65:A#3~78
69:A#3~78
70:A#3~78
72:G#3~78
73:A#3~78
77:A#3~78
81:G#3~78
85:G#3~78
86:G#3~78
88:F#3~78
89:G#3~78
93:G#3~78
97:F#3~78
101:F#3~78
102:F#3~78
104:E3~78
105:F#3~78
109:F#3~78
113:C#4~78
117:C#4~78
118:C#4~78
120:C4~78
121:C#4~78
125:C#4~78
=4;vol=78;mute=0
1:long P15~68
5:long P15~68
6:long P15~68
8:long P15~68
9:long P15~68
13:long P15~68
14:long P15~68
16:long P15~68
17:long P15~68
21:long P15~68
22:long P15~68
24:long P15~68
25:long P15~68
29:long P15~68
30:long P15~68
32:long P15~68
33:long P15~68
37:long P15~68
38:long P15~68
40:long P15~68
41:long P15~68
45:long P15~68
46:long P15~68
48:long P15~68
49:long P15~68
53:long P15~68
57:long P15~68
61:long P15~68
63:long P15~68
65:long P15~68
69:long P15~68
70:long P15~68
72:long P15~68
73:long P15~68
77:long P15~68
81:long P15~68
85:long P15~68
86:long P15~68
88:long P15~68
89:long P15~68
93:long P15~68
97:long P15~68
101:long P15~68
102:long P15~68
104:long P15~68
105:long P15~68
109:long P15~68
113:long P15~68
117:long P15~68
118:long P15~68
120:long P15~68
121:long P15~68
125:long P15~68
=5;vol=74;mute=0`,
  },
];

export function getSongExampleById(exampleId: string) {
  return songExamples.find((example) => example.id === exampleId) ?? null;
}
