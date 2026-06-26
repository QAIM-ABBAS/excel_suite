import { create } from 'zustand'

export type ToolView = 'dashboard' | 'merge' | 'convert' | 'duplicates' | 'sort' | 'attendance' | 'download-excel' | 'download-images' | 'settings' | 'about'
export type ThemeMode = 'light' | 'dark'

interface FileHistoryItem {
  id: string
  filename: string
  originalName: string
  tool: string
  status: string
  createdAt: string
}

interface AppState {
  // Navigation
  currentView: ToolView
  setCurrentView: (view: ToolView) => void

  // Theme
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void

  // File History
  fileHistory: FileHistoryItem[]
  addFileHistory: (item: FileHistoryItem) => void
  clearFileHistory: () => void

  // Global loading
  isLoading: boolean
  setIsLoading: (loading: boolean) => void

  // Active tasks
  activeTasks: number
  incrementActiveTasks: () => void
  decrementActiveTasks: () => void
}

export const useAppStore = create<AppState>((set) => ({
  currentView: 'dashboard',
  setCurrentView: (view) => set({ currentView: view }),

  theme: 'dark',
  setTheme: (theme) => set({ theme }),

  fileHistory: [],
  addFileHistory: (item) => set((state) => ({ fileHistory: [item, ...state.fileHistory].slice(0, 50) })),
  clearFileHistory: () => set({ fileHistory: [] }),

  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),

  activeTasks: 0,
  incrementActiveTasks: () => set((state) => ({ activeTasks: state.activeTasks + 1 })),
  decrementActiveTasks: () => set((state) => ({ activeTasks: Math.max(0, state.activeTasks - 1) })),
}))
