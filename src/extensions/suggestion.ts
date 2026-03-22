import { Mark, mergeAttributes } from "@tiptap/core";

export interface SuggestionDeleteOptions {
  HTMLAttributes: Record<string, string>;
}

export interface SuggestionAddOptions {
  HTMLAttributes: Record<string, string>;
}

/**
 * Mark for deleted text in a suggestion (strikethrough, red bg).
 * Stores a suggestionId so we can group add/delete marks together.
 */
export const SuggestionDelete = Mark.create<SuggestionDeleteOptions>({
  name: "suggestionDelete",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      suggestionId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-suggestion-id"),
        renderHTML: (attributes) => ({
          "data-suggestion-id": attributes.suggestionId,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-suggestion-delete="true"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-suggestion-delete": "true",
        class: "suggestion-delete",
      }),
      0,
    ];
  },
});

/**
 * Mark for added text in a suggestion (green bg).
 */
export const SuggestionAdd = Mark.create<SuggestionAddOptions>({
  name: "suggestionAdd",

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      suggestionId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-suggestion-id"),
        renderHTML: (attributes) => ({
          "data-suggestion-id": attributes.suggestionId,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-suggestion-add="true"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-suggestion-add": "true",
        class: "suggestion-add",
      }),
      0,
    ];
  },
});
