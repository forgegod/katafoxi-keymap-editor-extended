/**
 * System Ukrainian host layout: xkb `ua(unicode)` over `ua(legacy)`.
 * Source of truth: `fixtures/xkb/symbols/ua`.
 */
export const SYSTEM_UA_SYMBOLS = `
default partial alphanumeric_keys
xkb_symbols "unicode" {

    include "ua(legacy)"

    name[Group1]= "Ukrainian";

    key <TLDE>	{[      apostrophe,           U02BC,          U0301,          asciitilde ]};  // Apostrophe and Stress symbol
    key <AE01>	{[               1,          exclam,    onesuperior                      ]};
    key <AE02>	{[               2,        quotedbl,    twosuperior,               U2019 ]};  // Single quote, used often as an apostrophe (deprecated)
    key <AE03>	{[               3,      numerosign,        section,               U20B4 ]};  // Paragraph and Hryvnia sign
    key <AE04>	{[               4,       semicolon,         dollar,            EuroSign ]};
    key <AE05>	{[               5,         percent,         degree                      ]};
    key <AE06>	{[               6,           colon,           less                      ]};
    key <AE07>	{[               7,        question,        greater                      ]};
    key <AE08>	{[               8,        asterisk, enfilledcircbullet                  ]};  // •
    key <AE09>	{[               9,       parenleft,    bracketleft,           braceleft ]};
    key <AE10>	{[               0,      parenright,   bracketright,          braceright ]};
    key <AE11>	{[           minus,      underscore,         emdash,              endash ]};
    key <AE12>	{[           equal,            plus,       notequal,           plusminus ]};

    key <AD01>	{[ Cyrillic_shorti, Cyrillic_SHORTI,    Cyrillic_je,         Cyrillic_JE ]};
    key <AD02>	{[    Cyrillic_tse,    Cyrillic_TSE,  Cyrillic_dzhe,       Cyrillic_DZHE ]};
    key <AD03>	{[      Cyrillic_u,      Cyrillic_U, Byelorussian_shortu, Byelorussian_SHORTU ]};
    key <AD04>	{[     Cyrillic_ka,     Cyrillic_KA,     registered                      ]};  // ®
    key <AD05>	{[     Cyrillic_ie,     Cyrillic_IE,    Cyrillic_io,         Cyrillic_IO ]};
    key <AD06>	{[     Cyrillic_en,     Cyrillic_EN,   Cyrillic_nje,        Cyrillic_NJE ]};
    key <AD12>	{[    Ukrainian_yi,    Ukrainian_YI, Cyrillic_hardsign,Cyrillic_HARDSIGN ]};

    key <AC02>	{[     Ukrainian_i,     Ukrainian_I,  Cyrillic_yeru,       Cyrillic_YERU ]};
    key <AC08>	{[     Cyrillic_el,     Cyrillic_EL,   Cyrillic_lje,        Cyrillic_LJE ]};
    key <AC09>	{[     Cyrillic_de,     Cyrillic_DE,    Serbian_dje,         Serbian_DJE ]};
    key <AC11>	{[    Ukrainian_ie,    Ukrainian_IE,     Cyrillic_e,          Cyrillic_E ]};

    key <BKSL>	{[ Ukrainian_ghe_with_upturn, Ukrainian_GHE_WITH_UPTURN, backslash,  bar ]};

    key <AB02>	{[    Cyrillic_che,    Cyrillic_CHE,   Serbian_tshe,        Serbian_TSHE ]};
    key <AB03>	{[     Cyrillic_es,     Cyrillic_ES,      copyright                      ]};  // ©
    key <AB06>	{[     Cyrillic_te,     Cyrillic_TE,      trademark                      ]};  // ™
    key <AB08>	{[     Cyrillic_be,     Cyrillic_BE,  guillemotleft,  doublelowquotemark ]};
    key <AB09>	{[     Cyrillic_yu,     Cyrillic_YU, guillemotright, leftdoublequotemark ]};
    key <AB10>	{[          period,           comma,          slash,            ellipsis ]};

    include "level3(ralt_switch)"
};

partial alphanumeric_keys
xkb_symbols "legacy" {

    name[Group1]= "Ukrainian (legacy)";

    key <TLDE>	{[      apostrophe,       asciitilde ]};
    key <AE01>	{[               1,          exclam  ]};
    key <AE02>	{[               2,         quotedbl ]};
    key <AE03>	{[               3,       numbersign ]};
    key <AE04>	{[               4,         asterisk ]};
    key <AE05>	{[               5,            colon ]};
    key <AE06>	{[               6,            comma ]};
    key <AE07>	{[               7,           period ]};
    key <AE08>	{[               8,        semicolon ]};
    key <AE09>	{[               9,        parenleft ]};
    key <AE10>	{[               0,       parenright ]};
    key <AE11>	{[           minus,       underscore ]};
    key <AE12>	{[           equal,             plus ]};

    key <AD01>	{[ Cyrillic_shorti,  Cyrillic_SHORTI ]};
    key <AD02>	{[    Cyrillic_tse,     Cyrillic_TSE ]};
    key <AD03>	{[      Cyrillic_u,       Cyrillic_U ]};
    key <AD04>	{[     Cyrillic_ka,      Cyrillic_KA ]};
    key <AD05>	{[     Cyrillic_ie,      Cyrillic_IE ]};
    key <AD06>	{[     Cyrillic_en,      Cyrillic_EN ]};
    key <AD07>	{[    Cyrillic_ghe,     Cyrillic_GHE ]};
    key <AD08>	{[    Cyrillic_sha,     Cyrillic_SHA ]};
    key <AD09>	{[  Cyrillic_shcha,   Cyrillic_SHCHA ]};
    key <AD10>	{[     Cyrillic_ze,      Cyrillic_ZE ]};
    key <AD11>	{[     Cyrillic_ha,      Cyrillic_HA ]};
    key <AD12>	{[    Ukrainian_yi,     Ukrainian_YI ]};
    key <BKSL>	{[ Ukrainian_ghe_with_upturn, Ukrainian_GHE_WITH_UPTURN ]};

    key <AC01>	{[     Cyrillic_ef,      Cyrillic_EF ]};
    key <AC02>	{[     Ukrainian_i,      Ukrainian_I ]};
    key <AC03>	{[     Cyrillic_ve,      Cyrillic_VE ]};
    key <AC04>	{[      Cyrillic_a,      Cyrillic_A  ]};
    key <AC05>	{[     Cyrillic_pe,      Cyrillic_PE ]};
    key <AC06>	{[     Cyrillic_er,      Cyrillic_ER ]};
    key <AC07>	{[      Cyrillic_o,      Cyrillic_O  ]};
    key <AC08>	{[     Cyrillic_el,      Cyrillic_EL ]};
    key <AC09>	{[     Cyrillic_de,      Cyrillic_DE ]};
    key <AC10>	{[    Cyrillic_zhe,     Cyrillic_ZHE ]};
    key <AC11>	{[    Ukrainian_ie,     Ukrainian_IE ]};

    key <LSGT>	{[           slash,              bar ]};
    key <AB01>	{[     Cyrillic_ya,      Cyrillic_YA ]};
    key <AB02>	{[    Cyrillic_che,     Cyrillic_CHE ]};
    key <AB03>	{[     Cyrillic_es,      Cyrillic_ES ]};
    key <AB04>	{[     Cyrillic_em,      Cyrillic_EM ]};
    key <AB05>	{[      Cyrillic_i,       Cyrillic_I ]};
    key <AB06>	{[     Cyrillic_te,      Cyrillic_TE ]};
    key <AB07>	{[Cyrillic_softsign,Cyrillic_SOFTSIGN]};
    key <AB08>	{[     Cyrillic_be,      Cyrillic_BE ]};
    key <AB09>	{[     Cyrillic_yu,      Cyrillic_YU ]};
    key <AB10>	{[           slash,         question ]};
};
`
