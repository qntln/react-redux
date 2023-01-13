import { getBatch } from './batch'
import { ConnectOptions } from '../components/connect'

// encapsulates the subscription logic for connecting a component to the redux store, as
// well as nesting subscriptions of descendant components, so that we can ensure the
// ancestor components re-render before descendants

type VoidFunc = () => void

type Listener = {
  callback: VoidFunc
  next: Listener | null
  prev: Listener | null
}

function createListenerCollection() {
  const batch = getBatch()
  let first: Listener | null = null
  let last: Listener | null = null

  return {
    clear() {
      first = null
      last = null
    },

    notify() {
      batch(() => {
        let listener = first
        while (listener) {
          listener.callback()
          listener = listener.next
        }
      })
    },

    get() {
      let listeners: Listener[] = []
      let listener = first
      while (listener) {
        listeners.push(listener)
        listener = listener.next
      }
      return listeners
    },

    subscribe(callback: () => void) {
      let isSubscribed = true

      let listener: Listener = (last = {
        callback,
        next: null,
        prev: last,
      })

      if (listener.prev) {
        listener.prev.next = listener
      } else {
        first = listener
      }

      return function unsubscribe() {
        if (!isSubscribed || first === null) return
        isSubscribed = false

        if (listener.next) {
          listener.next.prev = listener.prev
        } else {
          last = listener.prev
        }
        if (listener.prev) {
          listener.prev.next = listener.next
        } else {
          first = listener.next
        }
      }
    },
  }
}

type ListenerCollection = ReturnType<typeof createListenerCollection>

export interface Subscription {
  addNestedSub: (listener: VoidFunc) => VoidFunc
  notifyNestedSubs: VoidFunc
  handleChangeWrapper: VoidFunc
  isSubscribed: () => boolean
  onStateChange?: VoidFunc | null
  trySubscribe: VoidFunc
  tryUnsubscribe: VoidFunc
  getListeners: () => ListenerCollection
}

const nullListeners = {
  notify() {},
  get: () => [],
} as unknown as ListenerCollection

interface ConnectOptionsRequiredSubscribe extends ConnectOptions {
  subscribe: string
}

export function createSubscription(
  store: any,
  parentSub?: Subscription,
  props?: any,
  connectOptions: ConnectOptionsRequiredSubscribe = {
    subscribe: 'subscribe',
  }
) {
  let unsubscribe: VoidFunc | undefined
  let listeners: ListenerCollection = nullListeners

  function addNestedSub(listener: () => void) {
    trySubscribe()
    return listeners.subscribe(listener)
  }

  function notifyNestedSubs() {
    listeners.notify()
  }

  function handleChangeWrapper() {
    if (subscription.onStateChange) {
      subscription.onStateChange()
    }
  }

  function isSubscribed() {
    return Boolean(unsubscribe)
  }

  function trySubscribe() {
    if (!unsubscribe) {
      // Unlike original react-redux, we treat top-level subscriptions and nested subscriptions the same
      // (we did the same in version 5 of this fork).
      // It could be worth it (performance-wise) to figure out how to make `this.parentSub.addNestedSub(this.handleChangeWrapper)`
      // support the changes in this fork but who knows.
      // If you're brave enough, uncomment the following and have fun.

      // unsubscribe = parentSub
      // ? parentSub.addNestedSub(handleChangeWrapper)
      // : store[connectOptions.subscribe](
      //     handleChangeWrapper,
      //     props,
      //     connectOptions
      //   )

      unsubscribe = store[connectOptions.subscribe](
        handleChangeWrapper,
        props,
        connectOptions
      )

      listeners = createListenerCollection()
    }
  }

  function tryUnsubscribe() {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = undefined
      listeners.clear()
      listeners = nullListeners
    }
  }

  const subscription: Subscription = {
    addNestedSub,
    notifyNestedSubs,
    handleChangeWrapper,
    isSubscribed,
    trySubscribe,
    tryUnsubscribe,
    getListeners: () => listeners,
  }

  return subscription
}
