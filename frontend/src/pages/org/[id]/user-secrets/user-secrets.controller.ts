import { useReducer } from "react"

import {State, TabsValue,TabTypes} from "./user-secrets.types"

const initialState : State = {
    activeTab: TabTypes.WebLogin
}

const reducer = (state: State, action: Partial<State>) => {
    return {...state, ...action}
}

export const useUserSecretsController = () => {
    const [state, dispatchState] = useReducer(reducer, {
        ...initialState
    })

    const updateSelectedTab = (tab: string) => {
        dispatchState({
            activeTab: tab as TabsValue
        })
    }

    return {
        ...state,
        dispatchState,
        updateSelectedTab
    }
}