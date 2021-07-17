const XML2JSON_OPTIONS = {
  compact: false,
  alwaysArray: true,
  alwaysChildren: true,
  trim: true,
  indentText: true,
  spaces: '  ',
};

const UNIQ_ATTRIBUTES_RE = /^([a-z0-9_-]*:)?id|src|href|cite|url|id|epub:type|type|alt|width|height$/uig;

const EXTERNAL_SANITIZER_PACKAGE_CONFIG = {
  allowProtocolRelative: true,
  parser: {
    lowerCaseTags: true,
    xmlMode: true,
    decodeEntities: false,
  },
  // Lots of these won't come up by default because we don't allow them
  selfClosing: ['img', 'br', 'hr', 'area', 'base', 'basefont', 'input', 'link', 'meta'],
  allowedSchemes: ['http', 'https', 'ftp', 'mailto'],
  allowedSchemesByTag: {},
  allowedSchemesAppliedToAttributes: ['*href', 'src', 'cite'],
  allowedTags: [
    'html',

    'head',
    'title',

    'body',

    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hgroup',

    'p',
    'section',
    'div',
    'code',
    'pre',
    'span',
    'blockquote',

    'svg',
    'image',
    'img',
    'video',
    'audio',

    'table',
    'tr',
    'td',
    'th',
    'tbody',
    'thead',

    'br',
    'hr',

    'a',

    'b',
    'i',
    'em',
    'strong',
    'sub',
    'sup',
  ],
  transformTags: {
    '*': (tagName, attribs) => ({
      tagName,
      // Avoid destructive empty attributes like <img alt="" href="#" />
      // Right options are: <img alt= href="#" /> or <img href="#" />
      attribs: omitBy(
        attribs,
        (v) => ((typeof v === 'string') && (v === '')),
      ),
    }),
  },
  allowedAttributes: {
    a: ['href'],
    img: ['alt', 'src', 'width', 'height'],
    image: ['*href', 'alt', 'width', 'height'],
    svg: ['*'],
    video: ['*'],
    audio: ['*'],
    html: ['xmlns:*'],
    '*': [
      '*id',
      '*:*',
      'id',
      'alt',
      'width',
      'height',
      'src',
      'href',
      'class',
      'style',
      'type',
      '*lang',
      '*language',
      'cite',
    ],
  },
};

module.exports = {
  EXTERNAL_SANITIZER_PACKAGE_CONFIG,
  UNIQ_ATTRIBUTES_RE,
  XML2JSON_OPTIONS,
};
