import { getBatch } from './batch'

// encapsulates the subscription logic for connecting a component to the redux store, as
// well as nesting subscriptions of descendant components, so that we can ensure the
// ancestor components re-render before descendants

const CLEARED = null
const nullListeners = { notify() {} }

function createListenerCollection() {
  const batch = getBatch()
  // the current/next pattern is copied from redux's createStore code.
  // TODO: refactor+expose that code to be reusable here?
  let current = []
  let next = []

  return {
    clear() {
      next = CLEARED
      current = CLEARED
    },

    notify() {
      const listeners = (current = next)
      batch(() => {
        for (let i = 0; i < listeners.length; i++) {
          listeners[i]()
        }
      })
    },

    get() {
      return next
    },

    subscribe(listener) {
      let isSubscribed = true
      if (next === current) next = current.slice()
      next.push(listener)

      return function unsubscribe() {
        if (!isSubscribed || current === CLEARED) return
        isSubscribed = false

        if (next === current) next = current.slice()
        next.splice(next.indexOf(listener), 1)
      }
    }
  }
}

export default class Subscription {
  constructor(
    store,
    parentSub,
    props,
    connectOptions,
    subscribe = 'subscribe'
  ) {
    this.store = store
    this.parentSub = parentSub
    this.unsubscribe = null
    this.listeners = nullListeners
    this.subscribeFuncName = subscribe
    this.props = props
    this.connectOptions = connectOptions
    this.handleChangeWrapper = this.handleChangeWrapper.bind(this)
  }

  addNestedSub(listener) {
    this.trySubscribe()
    return this.listeners.subscribe(listener)
  }

  notifyNestedSubs() {
    this.listeners.notify()
  }

  handleChangeWrapper() {
    if (this.onStateChange) {
      this.onStateChange()
    }
  }

  isSubscribed() {
    return Boolean(this.unsubscribe)
  }

  trySubscribe() {
    if (!this.unsubscribe) {
      // Unlike original react-redux, we treat top-level subscriptions and nested subscriptions the same
      // (we did the same in version 5 of this fork).
      // It could be worth it (performance-wise) to figure out how to make `this.parentSub.addNestedSub(this.handleChangeWrapper)`
      // support the changes in this fork but who knows.
      // If you're brave enough, uncomment the following and have fun.

      // this.unsubscribe = this.parentSub
      // ? this.parentSub.addNestedSub(this.handleChangeWrapper)
      // : this.store[this.subscribeFuncName](
      //     this.handleChangeWrapper,
      //     this.props,
      //     this.connectOptions
      //   )

      this.unsubscribe = this.store[this.subscribeFuncName](
        this.handleChangeWrapper,
        this.props,
        this.connectOptions
      )

      this.listeners = createListenerCollection()
    }
  }

  tryUnsubscribe() {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
      this.listeners.clear()
      this.listeners = nullListeners
    }
  }
}
