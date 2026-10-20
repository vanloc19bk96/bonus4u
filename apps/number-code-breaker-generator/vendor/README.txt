vendor/ — third-party files bundled so the app never needs the network.

jspdf.umd.min.js
    jsPDF 2.5.1 (UMD build), Copyright (c) 2010-2021 James Hall and contributors.
    MIT licence — https://github.com/parallax/jsPDF/blob/master/LICENSE

    The UMD build is required: the ES-module build cannot be loaded from a
    file:// page.

font-notosans.js
    Noto Sans Regular and Bold, converted to base64 TTF strings for jsPDF's
    virtual file system. Copyright 2022 The Noto Project Authors.
    SIL Open Font License 1.1 — see OFL.txt in this folder.

    Embedding a real TTF is not optional. jsPDF's built-in Helvetica, Times and
    Courier are PDF "standard 14" fonts: they are referenced but never embedded,
    and KDP rejects interiors with non-embedded fonts.

    Two globals are exposed:

        window.NOTO_SANS_BASE64
        window.NOTO_SANS_BOLD_BASE64

    To rebuild this file from the two TTFs:

        node -e "const fs=require('fs');
        const b=f=>fs.readFileSync(f).toString('base64');
        fs.writeFileSync('font-notosans.js',
          'window.NOTO_SANS_BASE64 = \"'+b('NotoSans-Regular.ttf')+'\";\n'+
          'window.NOTO_SANS_BOLD_BASE64 = \"'+b('NotoSans-Bold.ttf')+'\";\n')"

    Any SIL OFL or Apache 2.0 font works — Open Sans and Lato are also fine.
    Keep the two global names and js/utils.js needs no change.

OFL.txt
    The SIL Open Font License 1.1, covering Noto Sans.

Note on the standard-14 fonts
    jsPDF registers Helvetica, Times, Courier, Symbol and ZapfDingbats in every
    document's shared font resource dictionary whether or not anything draws
    with them. js/pdf-export.js removes those entries from the finished file, so
    the exported PDF contains no non-embedded font. See stripUnusedCoreFonts().
