import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from 'zustand/middleware/immer'

export class Dimensions {
  // this dimensions class is used to calculate the dimensions of the output
  // given x0, y0, x1, y1
  constructor(
    public x0: number,
    public y0: number,
    public x1: number,
    public y1: number,
  ) { }

  get width() {
    return this.x1 - this.x0;
  }

  get height() {
    return this.y1 - this.y0;
  }
}

export interface TextData {
  // this would be the callId
  id: string;
  type: "text";
  value: string;
  annotations: {
    type: string;
    text: string;
    start_index: number;
    end_index: number;
    url_citation?: {
      url: string;
      title: string;
    };
    file_citation?: {
      file_id: string;
    };
  }[];
}

export interface ImageData {
  id: string;
  type: "image";
  description: string;
  image_url: string;
  size: string;
  quality: string;
  created_at?: string; // ISO timestamp
  session_id?: string; // Session-Zuordnung
}

export interface VideoData {
  id: string;
  type: "video";
  description: string;
  video_url: string;
  duration: number; // in seconds
  thumbnail_url?: string; // optional thumbnail for the video
}


export type Data = TextData | ImageData | VideoData

export interface OutputNode {
  id: string;
  title: string;
  description?: string;
  value: number;
  data?: Data;
  children: OutputNode[];
  // Kennzeichnet Optimistic-Status
  pending?: boolean;
}


export interface OutputStore {
  output: OutputNode;
  addRoot: (newRoot: OutputNode) => void;
  addOutput: (parentId: string, parentTitle: string, newOutput: OutputNode) => void;
  addLeaf: (parentId: string, newLeaf: OutputNode) => void;
  removeLeaf: (id: string) => void;
  currentSessionId: string | null;
  setSession: (sessionId: string) => void;

  changeValue: (id: string, value: number) => void;
  addOrUpdateRootLeaf: (newLeaf: OutputNode) => void;
  getAllImages: () => ImageData[];
  reset: () => void;
  // Optimistic Update Helpers
  addPendingOutput: (parentId: string, parentTitle: string, node: Omit<OutputNode, 'id'>) => string;
  commitPendingOutput: (tempId: string, realId?: string) => void;
  rollbackPendingOutput: (tempId: string) => void;
}

export const useOutputStore = create<OutputStore>()(
  persist(
    immer(
      (set, get) => ({
        output: {
          id: "root",
          title: "root",
          value: 1,
          children: [],
        },
        currentSessionId: null,
        setSession: (sessionId) =>
          set((state) => {
            state.currentSessionId = sessionId;
            // Beim Session-Wechsel Galerie zurücksetzen
            state.output = { id: "root", title: "root", value: 1, children: [] };
          }),
        addRoot: (newRoot) =>
          set((state) => {
            state.output = newRoot;
          }),
        addOutput: (parentId, parentTitle, newOutput) =>
          set((state) => {
            const parentOutput = state.output.children.find((child) => child.id === parentId);
            if (!parentOutput) {
              // If the parent output doesn't exist, create it and add the new output as its child
              state.output.children = [...state.output.children, { id: parentId, title: parentTitle, value: 1, children: [newOutput] }];
            } else {
              // If the parent output exists, add the new output as its child
              parentOutput.children = [...parentOutput.children, newOutput];
            }
          }),
        addLeaf: (parentId, newLeaf) =>
          set((state) => {
            const addLeafRecursively = (node: OutputNode): OutputNode => {
              if (node.id === parentId) {
                return { ...node, children: [...node.children, newLeaf] };
              }
              return {
                ...node,
                children: node.children.map(addLeafRecursively),
              };
            };

            state.output = addLeafRecursively(state.output);
          }),
        removeLeaf: (id) => {
          set((state) => {
            const removeLeafRecursively = (node: OutputNode): OutputNode => {
              if (node.id === id) {
                return { ...node, children: [] };
              }
              return {
                ...node,
                children: node.children
                  .map(removeLeafRecursively)
                  .filter((child) => child.id !== id),
              };
            };
            state.output = removeLeafRecursively(state.output);
          });
        },
        changeValue: (id, value) => {
          set((state) => {
            const changeValueRecursively = (node: OutputNode): OutputNode => {
              if (node.id === id) {
                return { ...node, value };
              }
              return {
                ...node,
                children: node.children.map(changeValueRecursively),
              };
            };
            state.output = changeValueRecursively(state.output);
          });
        },
        addOrUpdateRootLeaf: (newLeaf) => {
          set((state) => {
            const idx = state.output.children.findIndex((child) => child.id === newLeaf.id);
            //console.log("idx", idx, state.output.children, newLeaf);
            if (idx === -1) {
              state.output.children = [...state.output.children, newLeaf];
            } else {
              //newLeaf.children = state.output.children[idx].children;
              // Update the existing leaf with the new one (leaving children intact)
              state.output.children[idx] = {
                id: newLeaf.id,
                title: newLeaf.title,
                value: newLeaf.value,
                description: newLeaf.description,
                data: newLeaf.data,
                children: state.output.children[idx].children || [],
              };
            }
          });
        },
        getAllImages: () => {
          const images: ImageData[] = [];
          const sessionId = useOutputStore.getState().currentSessionId;
          const getImagesRecursively = (node: OutputNode) => {
            if (node.data && node.data.type === "image") {
              const img = node.data as ImageData;
              if (!sessionId || img.session_id === sessionId) {
                images.push(img);
              }
            }
            node.children.forEach(getImagesRecursively);
          };
          getImagesRecursively(useOutputStore.getState().output);
          return images;
        },
        reset: () => {
          set((state) => {
            state.output = {
              id: "root",
              title: "root",
              value: 1,
              children: [],
            };
          });
        },
        // Fügt einen pending-Knoten ein und gibt eine temporäre ID zurück
        addPendingOutput: (parentId, parentTitle, node) => {
          const tempId = 'tmp_' + Math.random().toString(36).slice(2)
          const pendingNode: OutputNode = { id: tempId, title: node.title, value: node.value, data: node.data, children: node.children || [], pending: true }
          useOutputStore.getState().addOutput(parentId, parentTitle, pendingNode)
          return tempId
        },
        // Markiert pending-Knoten als bestätigt und aktualisiert optional die ID
        commitPendingOutput: (tempId, realId) => {
          set((state) => {
            const updateRec = (n: OutputNode): OutputNode => {
              if (n.id === tempId && n.pending) {
                return { ...n, id: realId || tempId, pending: false }
              }
              return { ...n, children: n.children.map(updateRec) }
            }
            state.output = updateRec(state.output)
          })
        },
        // Entfernt pending-Knoten (Rollback)
        rollbackPendingOutput: (tempId) => {
          set((state) => {
            const removeRec = (n: OutputNode): OutputNode => ({
              ...n,
              children: n.children.filter(c => c.id !== tempId).map(removeRec),
            })
            state.output = removeRec(state.output)
          })
        },
      })
    ),
    {
      name: "output-storage",
      storage: createJSONStorage(() => localStorage),
    })
);
