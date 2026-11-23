import type {
  AppAtomicToolDefinition,
  AppOperationExposure,
  AppOperationRisk,
} from '@purescience/platform-ui/bridge/appFunctions'

/**
 * Lossless catalog of all 11 PureWhiteboard atomic tool schemas extracted from `plugin.json`.
 *
 * Each entry declares:
 *   - `category`: clean domain grouping for `discoverAppTools`
 *   - `exposure`: `'always'` (3 core lifecycle/context/export tools) or `'extended'` (8 specialist tools)
 *   - explicit `risk` and `requiresApproval` satisfying `scripts/check-manifests.mjs`
 */
export type PureWhiteboardAtomicToolSchema = Omit<
  AppAtomicToolDefinition<unknown>,
  'opClass' | 'run'
> & {
  exposure: AppOperationExposure
  risk: AppOperationRisk
}

export const PUREWHITEBOARD_ATOMIC_TOOL_SCHEMAS: readonly PureWhiteboardAtomicToolSchema[] =
  [
    // ---- Core atomic tools (exposure: 'always') ----------------------------
    {
      name: 'getWhiteboardContext',
      category: 'canvas',
      exposure: 'always',
      risk: 'read',
      requiresApproval: false,
      description:
        'Read the current whiteboard: elementCount, selectedElementIds, and the elements with id, type, position, size, text (a free text, or the label of a shape or arrow), from/to (the ids an arrow is bound to) and colors. Call this first — connect, styleElement and removeElement need ids from it; labels attached to a shape are reported on the shape, not as separate elements.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'createWhiteboard',
      category: 'document',
      exposure: 'always',
      risk: 'write',
      requiresApproval: false,
      description:
        'Create and open a separate saved whiteboard in the workspace Drafts folder. This is the normal output location; source fixture folders need not hold outputs. Returns its real packagePath without clearing prior work.',
      inputSchema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
          },
        },
        required: ['title'],
      },
    },
    {
      name: 'exportImage',
      category: 'export',
      exposure: 'always',
      risk: 'write',
      requiresApproval: true,
      description:
        "Export the whole board as a PNG into the package's assets/exports folder (saving the board first if it has never been saved). Call getWhiteboardContext first to verify textOverlaps is empty and obtain document.packagePath. Returns the file path and refuses when the board is empty.",
      inputSchema: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
            description:
              'Optional file name; ".png" is added when missing. Defaults to the last export name.',
          },
          packagePath: {
            type: 'string',
            description:
              'Exact document.packagePath from getWhiteboardContext or createWhiteboard. Refuses if the tab changed documents.',
          },
        },
        required: ['packagePath'],
      },
    },

    // ---- Extended specialist atomic tools (exposure: 'extended') -----------
    {
      name: 'openWhiteboard',
      category: 'document',
      exposure: 'extended',
      risk: 'read',
      requiresApproval: false,
      description:
        'Validate and open an existing .whiteboard package by absolute path, binding it as the active board. Call getWhiteboardContext first to inspect the current board if needed; returns its real packagePath.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'saveWhiteboard',
      category: 'document',
      exposure: 'extended',
      risk: 'write',
      requiresApproval: false,
      description:
        'Flush the current scene to disk and validate the saved scene; call getWhiteboardContext first to obtain document.packagePath. Returns packagePath.',
      inputSchema: {
        type: 'object',
        properties: {
          packagePath: {
            type: 'string',
            description:
              'Exact document.packagePath from getWhiteboardContext or createWhiteboard. Refuses if the tab changed documents.',
          },
        },
        required: ['packagePath'],
      },
    },
    {
      name: 'addShape',
      category: 'canvas',
      exposure: 'extended',
      risk: 'write',
      requiresApproval: false,
      description:
        'Add a single rectangle, ellipse or diamond, optionally labelled. Call getWhiteboardContext first for document.packagePath. x/y/width/height are in scene units; when x and y are omitted the shape is placed to the right of the existing content. Returns the new id.',
      inputSchema: {
        type: 'object',
        properties: {
          shape: {
            type: 'string',
            enum: ['rectangle', 'ellipse', 'diamond'],
          },
          x: {
            type: 'number',
          },
          y: {
            type: 'number',
          },
          width: {
            type: 'number',
          },
          height: {
            type: 'number',
          },
          label: {
            type: 'string',
          },
          backgroundColor: {
            type: 'string',
            description: 'Hex fill, named Excalidraw color, or transparent.',
          },
          strokeColor: {
            type: 'string',
          },
          packagePath: {
            type: 'string',
            description:
              'Exact document.packagePath from getWhiteboardContext or createWhiteboard. Refuses if the tab changed documents.',
          },
        },
        required: ['shape', 'packagePath'],
      },
    },
    {
      name: 'addText',
      category: 'canvas',
      exposure: 'extended',
      risk: 'write',
      requiresApproval: false,
      description:
        'Add a free text label. Call getWhiteboardContext first for document.packagePath. When x and y are omitted it is placed to the right of the existing content. Returns the new id.',
      inputSchema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
          },
          x: {
            type: 'number',
          },
          y: {
            type: 'number',
          },
          fontSize: {
            type: 'number',
          },
          packagePath: {
            type: 'string',
            description:
              'Exact document.packagePath from getWhiteboardContext or createWhiteboard. Refuses if the tab changed documents.',
          },
        },
        required: ['text', 'packagePath'],
      },
    },
    {
      name: 'connect',
      category: 'canvas',
      exposure: 'extended',
      risk: 'write',
      requiresApproval: false,
      description:
        'Draw an arrow bound to two existing elements by id (shapes, text or images — not another arrow), optionally labelled. Call getWhiteboardContext first for element IDs and document.packagePath. Bound arrows follow their elements when the user moves them. Place both ends before connecting.',
      inputSchema: {
        type: 'object',
        properties: {
          fromId: {
            type: 'string',
          },
          toId: {
            type: 'string',
          },
          label: {
            type: 'string',
          },
          packagePath: {
            type: 'string',
            description:
              'Exact document.packagePath from getWhiteboardContext or createWhiteboard. Refuses if the tab changed documents.',
          },
        },
        required: ['fromId', 'toId', 'packagePath'],
      },
    },
    {
      name: 'styleElement',
      category: 'styling',
      exposure: 'extended',
      risk: 'write',
      requiresApproval: false,
      description:
        "Restyle one element by id: backgroundColor (hex, Excalidraw color name, or \"transparent\"), strokeColor, strokeWidth in px, opacity 0-100. Call getWhiteboardContext first for element IDs and document.packagePath. At least one of the four is required; position, size and text are the user's to edit on the canvas.",
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
          },
          backgroundColor: {
            type: 'string',
          },
          strokeColor: {
            type: 'string',
          },
          strokeWidth: {
            type: 'number',
          },
          opacity: {
            type: 'number',
          },
          packagePath: {
            type: 'string',
            description:
              'Exact document.packagePath from getWhiteboardContext or createWhiteboard. Refuses if the tab changed documents.',
          },
        },
        required: ['id', 'packagePath'],
      },
    },
    {
      name: 'removeElement',
      category: 'canvas',
      exposure: 'extended',
      risk: 'destructive',
      requiresApproval: true,
      description:
        "Delete one element by id, together with its label; arrows attached to it stay but are unbound from it. Call getWhiteboardContext first for element IDs and document.packagePath. Only at the user's direction.",
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
          },
          packagePath: {
            type: 'string',
            description:
              'Exact document.packagePath from getWhiteboardContext or createWhiteboard. Refuses if the tab changed documents.',
          },
        },
        required: ['id', 'packagePath'],
      },
    },
    {
      name: 'clearWhiteboard',
      category: 'document',
      exposure: 'extended',
      risk: 'destructive',
      requiresApproval: true,
      description:
        'Erase every element. Call getWhiteboardContext first to inspect the board and obtain document.packagePath. Refuses while the board holds work unless confirm is true — pass it only when the user asked to start over. The user can undo with ⌘Z in the canvas.',
      inputSchema: {
        type: 'object',
        properties: {
          confirm: {
            type: 'boolean',
            description: 'Must be true to erase a board that holds elements.',
          },
          packagePath: {
            type: 'string',
            description:
              'Exact document.packagePath from getWhiteboardContext or createWhiteboard. Refuses if the tab changed documents.',
          },
        },
        required: ['packagePath'],
      },
    },
  ]
