import React, { createContext, useContext, useReducer, type ReactNode, type Dispatch } from 'react'
import type { DocumentTemplateRecord } from '../../documents.api'
import type { LayoutV3 } from '@campusone/document-engine'
import type { StudioNextAction, StudioNextState } from '../types'
import { initialStudioNextState, studioNextReducer } from './studioNextReducer'

interface StudioNextContextValue {
  state: StudioNextState
  dispatch: Dispatch<StudioNextAction>
}

const StudioNextContext = createContext<StudioNextContextValue | null>(null)

export interface StudioNextProviderProps {
  children: ReactNode
  template?: DocumentTemplateRecord
  layoutV3?: LayoutV3
}

export function StudioNextProvider({ children, template, layoutV3 }: StudioNextProviderProps) {
  const [state, dispatch] = useReducer(
    studioNextReducer,
    initialStudioNextState(template, layoutV3),
  )

  return (
    <StudioNextContext.Provider value={{ state, dispatch }}>
      {children}
    </StudioNextContext.Provider>
  )
}

export function useStudioNext(): StudioNextContextValue {
  const ctx = useContext(StudioNextContext)
  if (!ctx) {
    throw new Error('useStudioNext must be used within a StudioNextProvider')
  }
  return ctx
}
