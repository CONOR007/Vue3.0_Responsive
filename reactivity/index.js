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

// toRefs
export function toRefs(proxy) {
  	// 判断proxy代理的是数组还是对象
    const ret = proxy instanceof Array ? new Array(proxy.length) : {};
    for (const key in proxy) {
      	// 转换成类似ref返回的对象
        ret[key] = toProxyKeys(proxy,key)
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

// 计算属性
export function computed(getter) {
    const result = ref();
    effect(()=>{
        result.value = getter()
    })
    return result
}
 