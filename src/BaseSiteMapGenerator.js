import sortBy from 'lodash/sortBy';
import xml from 'xml';
import moment from 'moment';
import path from 'path';

import * as utils from './utils';

// Sitemap specific xml namespace declarations that should not change
const XMLNS_DECLS = {
    _attr: {
        xmlns: `http://www.sitemaps.org/schemas/sitemap/0.9`,
        'xmlns:image': `http://www.google.com/schemas/sitemap-image/1.1`,
    },
};

export default class BaseSiteMapGenerator {
    ISO8601_FORMAT = `YYYY-MM-DDTHH:mm:ssZ`;
    constructor() {
        this.nodeLookup = {};
        this.nodeTimeLookup = {};
        this.siteMapContent = null;
        this.lastModified = 0;
    }

    generateXmlFromNodes(options) {
        const self = this;
        // Get a mapping of node to timestamp
        const timedNodes = Object.values(this.nodeLookup).map((node, id) => {
            return {
                id: id,
                // Using negative here to sort newest to oldest
                ts: -(self.nodeTimeLookup[id] || 0),
                node: node,
            };
        });
        // Sort nodes by timestamp
        const sortedNodes = sortBy(timedNodes, `ts`);
        // Grab just the nodes
        const urlElements = sortedNodes.map((el) => el.node);
        const data = {
            // Concat the elements to the _attr declaration
            urlset: [XMLNS_DECLS].concat(urlElements),
        };

        // Return the xml
        return utils.sitemapsUtils.getDeclarations(options) + xml(data);
    }

    addUrl(url, datum) {
        const node = this.createUrlNodeFromDatum(url, datum);

        if (node) {
            this.updateLastModified(datum);
            this.updateLookups(datum, node);
            // force regeneration of xml
            this.siteMapContent = null;
        }
    }

    removeUrl(url, datum) {
        this.removeFromLookups(datum);

        // force regeneration of xml
        this.siteMapContent = null;
        this.lastModified = moment(new Date());
    }

    getLastModifiedForDatum(datum) {
        if (datum.updated_at || datum.published_at || datum.created_at) {
            const modifiedDate =
                datum.updated_at || datum.published_at || datum.created_at;

            return moment(new Date(modifiedDate));
        } else {
            return moment(new Date());
        }
    }

    updateLastModified(datum) {
        const lastModified = this.getLastModifiedForDatum(datum);

        if (!this.lastModified || lastModified > this.lastModified) {
            this.lastModified = lastModified;
        }
    }

    createUrlNodeFromDatum(url, datum) {
        const node = {
            url: [
                { loc: url },
                {
                    lastmod: moment(
                        this.getLastModifiedForDatum(datum),
                        this.ISO8601_FORMAT
                    ).toISOString(),
                },
            ],
        };

        const imageNodes = this.createImageNodesFromDatum(datum);
        node.url.push(...imageNodes);

        return node;
    }

    createImageNodesFromDatum(datum) {
        const imageNodes = [];

        // Check for cover first because user has cover but the rest only have image
        const coverImageData =
            datum.cover_image || datum.profile_image || datum.feature_image;

        if (coverImageData?.path) {
            const nodeImage = this.createImageNode(coverImageData);
            imageNodes.push(nodeImage);
        }

        if (datum.page_images) {
            const pageImages = datum.page_images
                .filter((imageData) => !!imageData?.path)
                .map((imageData) => this.createImageNode(imageData));
            imageNodes.push(...pageImages);
        }

        return imageNodes;
    }

    createImageNode(image) {
        // Create the weird xml node syntax structure that is expected
        const imageEl = [
            { "image:loc": image.path },
            { "image:caption": image?.caption || path.basename(image) },
        ];

        // Return the node to be added to the url xml node
        return { "image:image": imageEl }; //eslint-disable-line
    }

    getXml(options) {
        if (this.siteMapContent) {
            return this.siteMapContent;
        }

        const content = this.generateXmlFromNodes(options);
        this.siteMapContent = content;
        return content;
    }

    /**
     * @NOTE
     * The url service currently has no url update event.
     * It removes and adds the url. If the url service extends it's
     * feature set, we can detect if a node has changed.
     */
    updateLookups(datum, node) {
        this.nodeLookup[datum.id] = node;
        this.nodeTimeLookup[datum.id] = this.getLastModifiedForDatum(datum);
    }

    removeFromLookups(datum) {
        delete this.nodeLookup[datum.id];
        delete this.nodeTimeLookup[datum.id];
    }

    reset() {
        this.nodeLookup = {};
        this.nodeTimeLookup = {};
        this.siteMapContent = null;
    }
}
