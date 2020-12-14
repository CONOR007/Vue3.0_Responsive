## 一. Reflect

**Reflect(反射)** 是一个内置的对象，它提供拦截 JavaScript 操作的方法。`Reflect`的所有属性和方法都是静态的（就像[`Math`](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Math)对象）。`Reflect` 对象提供了的静态方法与[proxy handler methods](https://wiki.developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/handler)的命名相同.其中的一些方法与 [`Object`](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Object)相同, 尽管二者之间存在 [某些细微上的差别](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Reflect/Comparing_Reflect_and_Object_methods) .

## 二. proxy

**语法**

```js
new Proxy(target, handler)
```

**参数**

- `target`

  `Proxy` 会对 target 对象进行包装。它可以是任何类型的对象，包括内置的数组，函数甚至是另一个代理对象。

- `handler`

  它是一个**对象**，**它的属性提供了某些操作发生时所对应的处理函数**。

**proxy中使用Reflect的两个需要注意的问题**

**问题1:**

**set 和 deleteProperty 中需要返回布尔类型的值,在严格模式下，如果返回 false 的话会出现 Type Error 的异常.**

```js
const target = {
  foo: 'xxx',
  bar: 'yyy'
}
const proxy = new Proxy(target, {
  get (target, key, receiver) {
    return Reflect.get(target, key, receiver)
  },
  set (target, key, value, receiver) {
    // 如果返回 false 的话会出现 Type Error 的异常
    return Reflect.set(target, key, value, receiver)
  },
  deleteProperty (target, key) {
    // 如果返回 false 的话会出现 Type Error 的异常
    return Reflect.deleteProperty(target, key)
  }
})
proxy.foo = 'zzz'
delete proxy.foo
```

**问题2:**

**Proxy 中的 receiver：Proxy 或者继承 Proxy 的对象.**
**Reflect 中的 receiver：如果目标对象中设置了 getter，getter 中的 this 指向 receiver**

```js
const obj = {
  get foo() {
    console.log(this) // getter中的this指向receiver(也就是Proxy对象)
    return this.bar
  }
}

const proxy = new Proxy(obj, {
  get (target, key, receiver) { // receiver指向Proxy对象
    if (key === 'bar') {
      return 'value - bar' 
    }
    return Reflect.get(target, key, receiver)
  }
})
console.log(proxy.foo) // 'value - bar'
```

## 三. 响应式系统原理-reactive

- **接受一个参数,判断这个参数是否是对象**
- **创建拦截器对象handler,设置get/set/deleteProperty**
- **返回Proxy对象**

**使用**

```html
<script type="module">
  import {reactive} from './reactivity/index.js';
  const obj = reactive({
    name:'zhangsan',
    age:'25',
    instrasting:{
      play:{
        bor : { name : 'footbor'}
      }
    }
  });
  const obj2 = reactive([1,2,3]);
  obj.name = 'zhangsan';
  delete obj.age;
  obj.sex = '男'
  console.log(obj.name);
</script>
```

**原理实现**

```js
const isObject = (target)=> target !== null && typeof target === 'object';
const convert = (target) => isObject(target) ? reactive(target) : target;
const isOwnProperty = (target,key) => Reflect.getOwnPropertyDescriptor(target,key);

export function reactive (target) {
    if(!isObject(target)) return target
    const handler = {
        get(target,key,receiver){
            console.log('get',key);
            // 递归 返回一个target 或 一个proxy对象
            return convert(Reflect.get(target,key,receiver))
        },
        set(target,key,value,receiver){
            const oldValue = Reflect.get(target,key,receiver);
            // set需要返回true,返回false的时候回报错
            if(oldValue !== value) {
                console.log('set',key,value);
                return Reflect.set(target,key,value,receiver)
            }
            return true
        },
        deleteProperty(target,key){
            // deleteProperty需要返回true,返回false的时候回报错
            // 判断target是否有key属性
            const hasKey = isOwnProperty(target,key);
            const result = Reflect.deleteProperty(target,key);
            if(hasKey && result){
                console.log('delete',key);
            }
          	return result
        }
    }
    return new Proxy(target,handler);
}
```

## 四. 响应式系统原理-effect && track && trigger

**使用**

```html
  <script type="module">
    import { reactive, effect } from './reactivity/index.js'
    const product = reactive({
      name: 'iPhone',
      price: 5000,
      count: 3
    })
    let total = 0 
    effect(() => {
      total = product.price * product.count
    })
    console.log(total)

    product.price = 4000
    console.log(total)

    product.count = 1
    console.log(total)
  </script>
```

**执行过程**

在effect函数内部首先会调用一遍箭头函数,在箭头函数中又访问了product,product是reactive返回的响应式代理对象,当访问product.price属性时会执行price的get方法,在get方法中会收集依赖,收集依赖的过程就是存储这个属性和这个箭头函数,而属性又跟对象相关,所以在代理对象的get当中首先会`new WeakMap()`存储目标对象`它的key就是product`,接下来访问product的属性price,`以price为key值使用new Map`把对应的箭头函数`用new set()`存储起来,这里是有对应关系的,目标对象,对应的属性以及对应的箭头函数,在触发更新的时候再根据对应的属性找到对应的函数.price的依赖收集完之后会继续访问product.count,它会执行count属性对应的get方法,在get方法中要存储目标对象以及count属性和箭头函数,当重新给product.price属性赋值的时候会触发它的set方法在set方法中就需要触发更新,触发更新其实就是找到依赖收集过程中存储对象的price属性以及对应的effect函数,找到函数之后立即执行.

**实现原理**

```js
const isObject = (target)=> target !== null && typeof target === 'object';
const convert = (target) => isObject(target) ? reactive(target) : target;
const isOwnProperty = (target,key) => Reflect.getOwnPropertyDescriptor(target,key);

export function reactive (target) {
    if(!isObject(target)) return target
    const handler = {
        get(target,key,receiver){
            // console.log('get',key);
            // 递归 依赖收集 返回一个target 或 一个proxy对象
            const result = convert(Reflect.get(target,key,receiver))
            if (result && activeEffect) {
                track(target,key)
            }
            return result
        },
        set(target,key,value,receiver){
            const oldValue = Reflect.get(target,key,receiver);
            // set需要返回true,返回false的时候回报错
            let result = true;
            if(oldValue !== value) {
                // console.log('set',key,value);
                result = Reflect.set(target,key,value,receiver);
                // 触发依赖
                trigger(target,key);
            }
            return result
        },
        deleteProperty(target,key){
            // deleteProperty需要返回true,返回false的时候回报错
            // 判断target是否有key属性
            const hasKey = isOwnProperty(target,key);
            let result = Reflect.deleteProperty(target,key);
            if(hasKey && result){
                // console.log('delete',key);
            }
          	return result
        }
    }
    return new Proxy(target,handler);
}

let activeEffect = null
export function effect (callback) {
    // 把callback存储起来
    activeEffect = callback;
    callback();//自执行一遍 触发对应get方法去依赖收集 依赖收集的时候需要用到activeEffect
    activeEffect = null; //当依赖收集完之后要清空存储 因为在依赖收集时如果有嵌套属性的话是一个递归的过程
}

// targetMap放在外面方便依赖收集与依赖触发
let targetMap = new WeakMap();
// track:依赖收集 把target存储到一个targetMap
export function track(target,key) {
    if(!activeEffect) return
    let depsMap = targetMap.get(target)
    if(!depsMap){
        targetMap.set(target,(depsMap = new Map()))
    }
    let dep = depsMap.get(key);
    if(!dep){
        depsMap.set(key,(dep = new Set()))
    }
    dep.add(activeEffect)
}

// 触发依赖
export function trigger(target,key) {
    let depsMap = targetMap.get(target);
    if(!depsMap) return
    let dep = depsMap.get(key);
    if(!dep) return
     dep.forEach(effect => {
         effect()
     });
}
```

## 五. 响应式系统原理-ref && torefs

**ref vs reactive**

- ref可以**把基本数据类型数据,转换成响应式对象**
- ref设置的响应式数据获取时需要使用**value**属性,模板中使用的时候可以省略value
- ref返回的对象,**重新给value属性赋值成对象之后也是响应式的**
- reactive**不能把基本类型数据转换成响应式对象**
- reactive返回的对象,**重新赋值会丢失响应式**.因为重新赋值的对象不再是代理对象
- reactive返回的对象**不可以解构**,如果需要结构的话需要使用**toRefs**来返回这个对象

**使用**

```js
  <script type="module">
    import { reactive, effect, ref } from './reactivity/index.js'

    const price = ref(5000)
    const count = ref(1)
    let total = 0 
    effect(() => {
      total = price.value * count.value
    })
    console.log(total)

    price.value = 4000
    console.log(total)

    count.value = 2
    console.log(total)
  </script>
```

**实现原理**

```js
// ref
export function ref(raw) {
    // 判断 raw 是否是ref 创建的对象, 如果是的话直接返回
    if(isObject(raw) && raw.__v_isRef) return;
    let value = convert(raw)
    const r = {
        __v_isRef: true,
        get value(){
            track(r,'value')
            return value
        },
        set value(newValue){
            if(newValue !== value) {
                raw = newValue
                value = convert(raw)
                trigger(r,'value')
            }
        }
    }
    return r
}
```

**toRefs**

`toRefs`的作用是**把reactive返回的对象的每一个属性转换成类似ref返回的对象,达到能对reactive返回对象解构的目的**

**使用**

```html
  <script type="module">
    import { reactive, effect, toRefs } from './reactivity/index.js'
    const {price,count} = toRefs(
      reactive({
        name: 'iPhone',
        price: 5000,
        count: 3
      })
    )
    let total = 0 
    effect(() => {
      total = price.value * count.value
    })
    console.log(total)
    price.value = 4000
    console.log(total)
    count.value = 1
    console.log(total)
  </script>
```

**实现原理**

```js
export function toRefs(proxy) {
  	// 判断proxy代理的是数组还是对象
    const ret = proxy instanceof Array ? new Array(proxy.length) : {};
    for (const key in toProxyKeys) {
      	// 转换成类似ref返回的对象
        ret[key] = toKeys(proxy,key)
    }
    return ret
}

function toProxyKeys(proxy,key) {
    const r = {
        __v_isRef:true, 
        get value(){
          	// 直接去代理对象中拿
            return proxy[key]
        },
        set value(newValue){
          	// proxy中的set会去判断新旧值
            proxy[key] = newValue
        }
    }
    return r
}
```

## 六. 响应式系统原理-computed

`computed`的作用是**接收一个有返回值的函数作为参数,并监听这个函数内部响应式数据的变化,最后把这个函数执行的结果返回.这个返回值就是计算属性的值.它是响应式的.**

**使用**

```html
  <script type="module">
    import { reactive, computed  } from './reactivity/index.js'
    const product = reactive({
        name: 'iPhone',
        price: 5000,
        count: 3
    })
    const total = computed(() => {
      return product.price * product.count
    })
    console.log(total.value)

    product.price = 4000
    console.log(total.value)

    product.count = 1
    console.log(total.value)
  </script>
```

**实现原理**

```js
export function computed(getter) {
    const result = ref();
    effect(()=>{
        result.value = getter()
    })
    return result
}
```