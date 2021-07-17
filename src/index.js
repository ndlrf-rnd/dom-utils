const Typograf = require('typograf');
const cloneDeep = require('lodash.clonedeep');
const fs = require('fs');
const get = require('lodash.get');
const omit = require('lodash.omit');
const set = require('lodash.set');
const traverse = require('traverse');

const { js2xml } = require('xml-js');
const {
  UNIQ_ATTRIBUTES_RE,
  EXTERNAL_SANITIZER_PACKAGE_CONFIG,
  XML2JSON_OPTIONS,
} = require('./constants');

const forceArray = (x) => (
  Array.isArray(x) ? x : [x].filter((v) => !!v)
);

const hasContent = (el, ignoreAttributes = false) => !!(
  el && (['br', 'hr'].indexOf(el.name) === -1) && (
    ((el.text || '').replace(/[_\-|*!~ \n\t\r]/uig, '').length > 0)
    || (
      (
        forceArray(el.elements).filter((v) => !!v)
      ).filter(
        (cel) => hasContent(cel),
      ).length > 0
    )
    || (
      ignoreAttributes ? false : Object.keys(el.attributes || {}).reduce(
        (acc, attr) => (acc || attr.match(UNIQ_ATTRIBUTES_RE)),
        false,
      )
    )
  )
);

// const isHeader = (node) => node && node.name && node.name.match(/^h([1-6]|group)$/ui);
const isHeaderEl = (node) => !!(node && (node.name || '').match(/(h([1-6]|group))$/ui));
const parseHeaderLevel = (level) => parseInt(`${level}`.match(/[0-9]+/ug) || '0', 10);
const getHeaderLevel = ({ level, name }) => parseHeaderLevel(level || name || '1');

const isToc = (node, ignoreAttributes = false) => !!(
  isHeaderEl(node)
  && (!((node && node.attributes ? node.attributes.class : '') || '').match(/not[^a-z]in[^a-z]toc/ui))
  && hasContent(node, ignoreAttributes)
);

const extendClass = (oldClass, newClass) => {
  const aObj = {
    [newClass.trim()]: true,
  };
  (oldClass || '').split(/\p{Z}+/uig).forEach(
    (x) => {
      x = x.trim();
      if (x.length > 0) {
        aObj[x] = true;
      }
    },
  );
  return Object.keys(aObj).sort().join(' ');
};

const getBody = (el) => {
  let res = null;
  if (el) {
    traverse(el).forEach((e) => {
      res = (e && (e.name === 'body')) ? e : res;
    });
  }
  return res;
};

const getHead = (el) => {
  let res = null;
  if (el) {
    traverse(el).forEach((e) => {
      res = (e && (e.name === 'head')) ? e : res;
    });
  }
  return res;
};

const bodyReducer = (root, el) => (
  root && (root.name === 'body')
    ? root
    : el.elements && el.elements.reduce(bodyReducer, el)
);

// const RE_NOT_IN_TOC_HALLMARK = /not.in.toc/ui;
// const xmlHaveText = (xml) => xml
//   .replace(/<[^>]+>/ug, '')
//   .replace(/[^0-9\p{L}]/uig, '').length > 0;

const findNumbers = (sanitizedPages) => {
  const numbersEls = [];
  sanitizedPages.forEach(
    (acc, page) => {
      const pageNumbersEls = [];
      const traverseNumbers = (el) => {
        if (el.attributes && el.attributes.class === 'box') {
          return;
        }
        if ((el.elements || []).map(({ text }) => text).filter(v => v && v.match(/^[0-9]+$/uig)).length > 0) {
          pageNumbersEls.push(el);
        }
        if (el.elements) {
          el.elements.filter(({ type }) => type !== 'text').forEach(traverseNumbers);
        }
      };
      traverseNumbers(page);
      numbersEls.push(pageNumbersEls);
    },
  );
  const suffixTree = {};
  const suffixLengths = {};
  numbersEls.forEach(
    pageNumbers => pageNumbers.forEach(
      ({ elements }) => elements.forEach(
        pn => {
          if (!suffixTree[pn.text]) {
            suffixTree[pn.text] = {};
            suffixLengths[pn.text] = 1;
          }
          Object.keys(suffixTree).sort().forEach(k => {
            if (
              (parseInt(k, 10) < parseInt(pn.text, 10))
              && (parseInt(k, 10) + 10 >= parseInt(pn.text, 10))
            ) {
              suffixTree[pn.text][k] = suffixTree[k];
              suffixLengths[pn.text] = suffixLengths[k] + 1;
            }
          });
        },
      ),
    ),
  );
  const chooseLargest = (o) => {
    if (typeof o === 'object') {
      const largest = Object.keys(o).sort(
        (a, b) => parseInt(b, 10) - parseInt(a, 10),
      )[0];
      return [parseInt(largest, 10), ...chooseLargest(o[largest])];
    }
    return [];
  };
  const longestSuffixTree = parseInt(
    Object.keys(suffixLengths).sort(
      (a, b) => (suffixLengths[b] - suffixLengths[a]) || (parseInt(b, 10) - parseInt(a, 10)),
    )[0],
    10,
  );
  const pageNumbers = [
    longestSuffixTree,
    ...chooseLargest(suffixTree[longestSuffixTree]),
  ].slice(0, numbersEls.length).filter(v => !!v).reverse();
  numbersEls.forEach((nl, idx) => {
    nl.filter(
      v => v.elements.filter(
        el => parseInt(el.text, 10) === pageNumbers[idx],
      ).length > 0,
    ).forEach((v) => {
      v.elements = [];
    });
  });
  return pageNumbers;
};

const toElementsPath = (pathSeg) => pathSeg.reduce(
  (a, seg) => ([...a, 'elements', seg]),
  [],
);

const cutElements = (someRoot) => forceArray(
  (getBody(someRoot) || { elements: [] }).elements,
).reduce(
  (acc, rootChild) => {
    let paths = [];

    const _t = (node, p) => {
      if (paths.length === 0) {
        paths.push([]);
      } else if (isToc(node, false)) {
        let i = paths[paths.length - 1].length - 1;
        const pps = paths[paths.length - 1];
        while (i > 0) {
          if (pps[i - 1][0].length >= pps[i][0].length) {
            break;
          }
          i -= 1;
        }
        paths[paths.length - 1] = pps.slice(0, i);
        paths.push(pps.slice(i));
      }
      paths[paths.length - 1].push([
        p || [],
        omit(cloneDeep(node), ['elements']),
      ]);
      if (node.elements && (node.elements.length > 0)) {
        node.elements.forEach(
          (child, idx) => _t(child, [...p, idx]),
        );
      }
      return paths;
    };
    _t(rootChild, [0]);

    paths = paths.filter(
      (section) => section.filter(
        (pe) => hasContent(pe[1]),
      ).length > 0,
    );
    paths = paths.map(
      (section) => section.map(
        (el) => {
          const start = section[0][0];
          const min = Math.max(
            0,
            section.reduce(
              (a, minEl) => Math.min(
                a,
                forceArray(minEl[0]).length,
              ),
              start.length,
            ),
          ) - 1;
          return [
            el[0].slice(min),
            el[1],
          ];
        },
      ),
    );
    return [
      ...acc,
      ...paths.reduce(
        (pathsAcc, section) => {
          const res = {};
          section.forEach(([p, n]) => {
            set(res, toElementsPath(p), omit(n, ['elements']));
            p.forEach((seg, idx) => {
              const parentPath = toElementsPath(p.slice(0, idx));
              const parentEl = get(res, parentPath, {});
              set(res, parentPath, {
                elements: [],
                name: 'section',
                type: 'element',
                ...parentEl,
              });
            });
          });
          process.stdout.write(
            `${[
              '\n---section---\n',
              section.map(
                ([p, n]) => `${p.join('.')} ${JSON.stringify(n).substr(0, 128)}`,
              ).join('\n'),
              res.elements.map((childEl) => js2xml(childEl, XML2JSON_OPTIONS)).join(' ').replace(/\n */uig, ' '),
            ].join('\n\n')}\n\n`,
          );
          return [...pathsAcc, ...res.elements];
        },
        [],
      ),
    ];
  },
  [],
).filter((x) => !!x);

const runThirdPartySanitizer = (black) => sanitizeHtml(
  black,
  EXTERNAL_SANITIZER_PACKAGE_CONFIG,
);

const loadAndSanitize = (uriOrPath) => {
  const f = fs.readFileSync(uriOrPath, 'utf-8');
  const notSectionedContent = recursiveAlignIds(
    JSON.parse(xml2json(
      runThirdPartySanitizer(f),
      XML2JSON_OPTIONS,
    )),
    uriOrPath,
  );
  // FIXME: Dont generate trash records
  return cutElements(notSectionedContent);
};

const typHtml = (htmlTxt, typografOptions) => {
  const typograf = new Typograf(typografOptions.global);
  typografOptions.rules.forEach((rule) => {
    typograf.setSetting(...rule);
  });
  return typograf
    .execute(htmlTxt)
    .replace(/<(br|nobr|img|video|audio)([^>]*[^/>]|)>/ug, '<$1 $2 />');
};

module.exports = {
  bodyReducer,
  cutElements,
  extendClass,
  findNumbers,
  forceArray,
  getBody,
  getHead,
  getHeaderLevel,
  hasContent,
  isHeaderEl,
  isToc,
  loadAndSanitize,
  parseHeaderLevel,
  toElementsPath,
  typHtml,
};
