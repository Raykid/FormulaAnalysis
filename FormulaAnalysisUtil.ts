
/**
 * @author Raykid
 * @email initial_r@qq.com
 * @create date 2018-10-17 11:33:13
 * @modify date 2018-10-17 11:33:13
 * @desc [description] 公式解析工具集
*/

export enum EnumExpressionType
{
    /** 立即数 */
    IMMEDIATE_VALUE,
    /** 运算符 */
    OPERATOR
}

export interface ExpressionNode
{
    /**
     * 表达式节点的特征值
     *
     * @type {string}
     * @memberof ExpressionNode
     */
    id:string;
    /**
     * 字符表示
     *
     * @type {string}
     * @memberof ExpressionNode
     */
    character:string;
    /**
     * 表达式节点类型
     *
     * @type {EnumExpressionType}
     * @memberof ExpressionNode
     */
    type:EnumExpressionType;
    /**
     * 子节点
     *
     * @type {ExpressionNode[]}
     * @memberof ExpressionNode
     */
    subNodes:ExpressionNode[];
}

/**
 * 使用相似性判断两棵树的相关性，效率高但命中率低
 *
 * @export
 * @param {ExpressionNode} treeA
 * @param {ExpressionNode} treeB
 * @returns {boolean}
 */
export function isRelativeBySimilarity(treeA:ExpressionNode, treeB:ExpressionNode):boolean
{
    return judgeSimilarity(treeA, treeB).similarity === 1;
}

/**
 * 使用派生树判断两棵树的相关性，效率低下但命中率高，最多支持4个符号
 *
 * @export
 * @param {ExpressionNode} treeA
 * @param {ExpressionNode} treeB
 * @returns {boolean}
 */
export function isRelativeByCompareTrees(treeA:ExpressionNode, treeB:ExpressionNode):boolean
{
    return compareTrees(treeA, treeB) != null;
}

/**
 * 直接使用得数判断两棵树相关性，是最粗糙的最后的手段
 *
 * @export
 * @param {ExpressionNode} treeA
 * @param {ExpressionNode} treeB
 * @returns {boolean}
 */
export function isRelativeByEval(treeA:ExpressionNode, treeB:ExpressionNode):boolean
{
    return judgeTreeEvalEquals(treeA, treeB);
}

/**
 * 对比两个公式，算出相差几步计算
 *
 * @export
 * @param {string} formulaA 公式1
 * @param {string} formulaB 公式2
 * @returns {(number|null)} 如果返回正数，则表示通过几步可以从A算出B；如果返回负数，则表示通过几步可以从B算出A；如果返回0表示两个公式相等；如果返回null表示两个公式无法相互计算
 */
export function compareFormulas(formulaA:string, formulaB:string):number|null
{
    // 首先求出两个公式自身的树
    const treeA:ExpressionNode = generateTree(formulaA);
    const treeB:ExpressionNode = generateTree(formulaB);
    return compareTrees(treeA, treeB);
}

/**
 * 对比两棵树，获得之间收敛步骤数
 *
 * @export
 * @param {ExpressionNode} treeA 树1
 * @param {ExpressionNode} treeB 树2
 * @returns {(number|null)} 收敛步数，正数表示正向收敛，负数表示反向收敛，null表示不具有收敛关系
 */
export function compareTrees(treeA:ExpressionNode, treeB:ExpressionNode):number|null
{
    // 如果两棵树的特征值相同，则认为相等
    if(treeA.id === treeB.id) return 0;
    // 取出两个公式中的可运算符号数量
    const operatorCountA:number = getOperatableOperatorCount(treeA);
    const operatorCountB:number = getOperatableOperatorCount(treeB);
    // 如果任何一个运算符号数量超过一定数量就改用直接求值策略
    if(operatorCountA > 4 || operatorCountB > 4)
    {
        return judgeTreeEvalEquals(treeA, treeB) ? operatorCountA - operatorCountB : null;
    }
    // 计算是否正向收敛
    let stepCount:number;
    if(operatorCountA >= operatorCountB)
    {
        stepCount = compareTreesWithOrder(treeA, treeB);
        // 返回结果
        return stepCount;
    }
    else
    {
        stepCount = compareTreesWithOrder(treeB, treeA);
        // 返回结果
        return stepCount && -stepCount;
    }
}

interface SimilarityData
{
    similarity:number;
    deriveTarget:ExpressionNode;
}

/**
 * 递归两棵树的相似性
 *
 * @param {ExpressionNode} target 扩展树
 * @param {ExpressionNode} template 模板树
 * @param {(similarity:number, deriveTarget:ExpressionNode)=>void} callback similarity: 相似性，取值范围为[0, 1]
 * @returns {void}
 */
function judgeSimilarity(target:ExpressionNode, template:ExpressionNode):SimilarityData
{
    // 先计算一下得数是否相等
    const isEquals:boolean = judgeTreeEvalEquals(target, template);
    if(!isEquals)
    {
        // 得数不相等就不用算了
        return {similarity: 0, deriveTarget: target};
    }
    else if(target.id.indexOf(template.id) >= 0 || template.id.indexOf(target.id) >= 0)
    {
        // 如果相等的情况下，具有包含关系，则直接返回1
        return {similarity: 1, deriveTarget: target};
    }
    else if(target.type === EnumExpressionType.IMMEDIATE_VALUE || template.type === EnumExpressionType.IMMEDIATE_VALUE)
    {
        // 如果有一边是立即数，直接返回1
        return {similarity: 1, deriveTarget: target};
    }
    else if(getOperatableOperatorCount(target) < getOperatableOperatorCount(template))
    {
        // 只算收敛
        return judgeSimilarity(template, target);
    }
    else
    {
        // 声明最相似对象
        let maxSimilar:SimilarityData;
        // 剩下的两棵树都是符号树，先判断符号是不是相同，相同的需要先递归子节点
        if(target.character === template.character)
        {
            // 符号相同的情况下，顺序是先递归算子节点，然后再套用各种律法进行变换，最后只找一个相似度最高的节点回调
            maxSimilar = judgeSubSimilarity(target, template);
            // 判断一次终止条件
            if(maxSimilar.similarity === 1)
            {
                return {similarity: 1, deriveTarget: maxSimilar.deriveTarget};
            }
        }
        else
        {
            maxSimilar = {
                similarity: 0,
                deriveTarget: target
            };
        }
        // 先判断运算符是否相同级别
        let deriveTrees:ExpressionNode[];
        const priorityA:number = getOperatorPriority(target.character);
        const priorityB:number = getOperatorPriority(template.character);
        if(priorityA === priorityB)
        {
            const associationList:ExpressionNode[] = [target];
            // 执行交换律
            deriveTrees = deriveCommutation(maxSimilar.deriveTarget);
            // 如果有交换律结果，则递归
            const commutationTree:ExpressionNode = deriveTrees[1];
            if(commutationTree)
            {
                maxSimilar = judgeSubSimilarity(commutationTree, template);
                // 判断一次终止条件
                if(maxSimilar.similarity === 1)
                {
                    return {similarity: 1, deriveTarget: commutationTree};
                }
                // 推入需要进行结合律的数组
                associationList.push(commutationTree);
            }
            // 执行结合律
            for(let associationTree of associationList)
            {
                deriveTrees = deriveAssociation(associationTree);
                for(let associationTree of deriveTrees)
                {
                    if(associationTree.id === target.id) continue;
                    maxSimilar = judgeSubSimilarity(associationTree, template);
                    // 判断一次终止条件
                    if(maxSimilar.similarity === 1)
                    {
                        return {similarity: 1, deriveTarget: associationTree};
                    }
                }
            }
        }
        else
        {
            // 执行分配率
            deriveTrees = deriveDistribution(maxSimilar.deriveTarget);
            for(let i:number = 1, len:number = deriveTrees.length; i < len; i++)
            {
                const distributionTree:ExpressionNode = deriveTrees[i];
                maxSimilar = judgeSubSimilarity(distributionTree, template);
                // 判断一次终止条件
                if(maxSimilar.similarity === 1)
                {
                    return {similarity: 1, deriveTarget: distributionTree};
                }
            }
        }
        // 最后统一回调当前最高相似度对象
        return maxSimilar;
    }
}

function judgeSubSimilarity(target:ExpressionNode, template:ExpressionNode):SimilarityData
{
    // 先找最高相似度的左节点
    let maxLeft:{similarity:number, deriveTarget:ExpressionNode} = judgeSimilarity(target.subNodes[0], template.subNodes[0]);
    // 再找最高相似度的右节点
    let maxRight:{similarity:number, deriveTarget:ExpressionNode} = judgeSimilarity(target.subNodes[1], template.subNodes[1]);
    // 回调
    const subSimilarity:number = (maxLeft.similarity + maxRight.similarity) * 0.5;
    const subTree:ExpressionNode = cloneExpressionNode(target, maxLeft.deriveTarget, maxRight.deriveTarget);
    return {similarity: subSimilarity, deriveTarget: subTree};
}

function compareTreesWithOrder(treeA:ExpressionNode, treeB:ExpressionNode):number|null
{
    // 首先判断得数
    if(!judgeTreeEvalEquals(treeA, treeB)) return null;
    // 对B进行递归约分
    treeB = traversalReduceFrac(treeB);
    // 获取B的运算符数
    const operatorCountB:number = getOperatableOperatorCount(treeB);
    // 先尝试收敛A树本身
    const stepCount:number = doCompare(treeA, treeB);
    if(stepCount != null) return stepCount;
    // 需要使用A的派生树开始计算
    const deriveTreesA:ExpressionNode[] = deriveTree(treeA);
    for(let deriveTreeA of deriveTreesA)
    {
        const stepCount:number = doCompare(deriveTreeA, treeB);
        if(stepCount != null) return stepCount;
    }
    // 没有与B匹配的收敛树
    return null;

    function doCompare(treeA:ExpressionNode, treeB:ExpressionNode):number|null
    {
        const result:ExpressionNode[] = [treeA];
        const operatorCountA:number = getOperatableOperatorCount(treeA);
        const stepCount:number = operatorCountA - operatorCountB;
        for(let i:number = 0; i < stepCount; i++)
        {
            for(let tempTree of result.splice(0, result.length))
            {
                const tempResult:ExpressionNode[] = constringeTree(tempTree);
                result.push.apply(result, tempResult);
            }
        }
        // 对比每一棵收敛树是否有与B相同的特征值
        for(let temp of result)
        {
            if(temp.id === treeB.id)
                return stepCount;
        }
        return null;
    }
}

function traversalReduceFrac(tree:ExpressionNode):ExpressionNode
{
    const newTree:ExpressionNode = cloneExpressionNode(tree);
    // 遍历树，找出所有经过通分的分数
    traverse(newTree, null, null, node=>{
        // 先判断立即数
        if(node.type === EnumExpressionType.IMMEDIATE_VALUE)
        {
            // 再判断分数
            const frac:[number, number, number] = parseFrac(node.character);
            if(frac)
            {
                // 每个分数节点都要尝试约分
                const newFrac:[number, number, number] = reduceFrac(frac);
                if(newFrac[2] !== frac[2])
                {
                    node.id = node.character = stringifyFrac(newFrac);
                }
            }
        }
        else
        {
            updateTreeId(node);
        }
    });
    return newTree;
}

function traverse(
    tree:ExpressionNode,
    before?:(node:ExpressionNode, subNodeA:ExpressionNode, subNodeB:ExpressionNode)=>boolean,
    callback?:(node:ExpressionNode, subNodeA:ExpressionNode, subNodeB:ExpressionNode)=>ExpressionNode[]|void,
    after?:(node:ExpressionNode, subNodeA:ExpressionNode, subNodeB:ExpressionNode)=>void
):ExpressionNode[] {
    const result:ExpressionNode[] = [];
    // 判断当前树是否可以回调了
    const subNodeA:ExpressionNode = tree.subNodes[0];
    const subNodeB:ExpressionNode = tree.subNodes[1];
    if(before && before(tree, subNodeA, subNodeB))
    {
        // 是可计算节点，直接回调
        const newNodes:ExpressionNode[]|void = callback && callback(tree, subNodeA, subNodeB);
        if(newNodes) result.push.apply(result, newNodes);
    }
    else
    {
        // 不是可计算节点，遍历子节点
        if(subNodeA)
        {
            const resultA:ExpressionNode[] = traverse(subNodeA, before, callback, after);
            for(let subResultA of resultA)
            {
                const newTree:ExpressionNode = cloneExpressionNode(tree, subResultA, subNodeB);
                result.push(newTree);
            }
        }
        if(subNodeB)
        {
            const resultB:ExpressionNode[] = traverse(subNodeB, before, callback, after);
            for(let subResultB of resultB)
            {
                const newTree:ExpressionNode = cloneExpressionNode(tree, subNodeA, subResultB);
                result.push(newTree);
            }
        }
        // 调用回溯回调
        after && after(tree, subNodeA, subNodeB);
    }
    return result;
}

/**
 * 收敛一棵树一步，生成收敛树集合
 *
 * @param {ExpressionNode} tree
 * @param {number} stepCount
 * @returns {ExpressionNode[]}
 */
function constringeTree(tree:ExpressionNode):ExpressionNode[]
{
    // 开始遍历树并计算结果
    const result:ExpressionNode[] = traverse(
        tree,
        (node:ExpressionNode, subNodeA:ExpressionNode, subNodeB:ExpressionNode)=>{
            return (
                subNodeA &&
                subNodeB &&
                subNodeA.type === EnumExpressionType.IMMEDIATE_VALUE &&
                subNodeB.type === EnumExpressionType.IMMEDIATE_VALUE
            );
        },
        (node:ExpressionNode, subNodeA:ExpressionNode, subNodeB:ExpressionNode)=>{
            // 生成一棵新树
            const value:string = evalNode(subNodeA.character, subNodeB.character, node.character);
            const newNode:ExpressionNode = {
                id: value,
                type: EnumExpressionType.IMMEDIATE_VALUE,
                character: value,
                subNodes: []
            };
            // 返回派生树结果
            return deriveFracFloat(newNode);
        }
    );
    return result;
}

const evalTreeCache:{[id:string]:ExpressionNode[]} = {};
/**
 * 求一棵树的最终结果
 *
 * @param {ExpressionNode} tree
 * @returns {ExpressionNode}
 */
function evalTree(tree:ExpressionNode):ExpressionNode[]
{
    let result:ExpressionNode[] = evalTreeCache[tree.id];
    if(result) return result;
    result = [tree];
    while(result[0].type !== EnumExpressionType.IMMEDIATE_VALUE)
    {
        result = constringeTree(result[0]);
    }
    result = result.filter(node=>node.type === EnumExpressionType.IMMEDIATE_VALUE);
    evalTreeCache[tree.id] = result;
    return result;
}

function evalNode(valueA:string, valueB:string, operator:string):string|null
{
    // 分别浮点数变分数
    const fracA:[number, number, number] = parseFrac(valueA) || floatToFrac(valueA);
    if(!fracA) return null;
    const fracB:[number, number, number] = parseFrac(valueB) || floatToFrac(valueB);
    if(!fracB) return null;
    // 进行计算
    switch(operator)
    {
        case "+":
            // 进行通分并解析
            var fracs:[number, number, number][] = commonDenominator(fracA, fracB);
            // 进行计算，整数和分子分别相加
            fracs[0][0] += fracs[1][0];
            fracs[0][1] += fracs[1][1];
            // 进行约分并返回结果
            return stringifyFrac(reduceFrac(fracs[0]));
        case "-":
            // 进行通分并解析
            var fracs:[number, number, number][] = commonDenominator(fracA, fracB);
            // 为防止分子为负数，将分数变为假分数
            fracs = fracs.map(toImproperFrac);
            // 进行计算，分子相减
            fracs[0][1] -= fracs[1][1];
            // 进行约分并返回结果
            return stringifyFrac(reduceFrac(fracs[0]));
        case "*":
            // 变为假分数
            var improperFracA:[number, number, number] = toImproperFrac(fracA);
            var improperFracB:[number, number, number] = toImproperFrac(fracB);
            // 分子分母分别相乘
            improperFracA[1] *= improperFracB[1];
            improperFracA[2] *= improperFracB[2];
            // 约分并返回结果
            return stringifyFrac(reduceFrac(improperFracA));
        case "/":
            // 变为假分数
            var improperFracA:[number, number, number] = toImproperFrac(fracA);
            var improperFracB:[number, number, number] = toImproperFrac(fracB);
            // 分子乘分母，分母乘分子
            improperFracA[1] *= improperFracB[2];
            improperFracA[2] *= improperFracB[1];
            // 约分并返回结果
            return stringifyFrac(reduceFrac(improperFracA));
    }
}

/**
 * 根据中序表达式生成表达式树
 *
 * @param {string} formulaStr 中序表达式
 * @returns {ExpressionNode[]} 表达式树根节点
 */
export function generateTree(formulaStr:string):ExpressionNode
{
    // 去除表达式中所有空白字符
    formulaStr = trimBlankCharacters(formulaStr);
    // 声明符号栈
    const stack:ExpressionNode[] = [];
    const result:ExpressionNode[] = [];
    // 开始扫描字符串
    for(let i:number = 0, len:number = formulaStr.length; i < len;)
    {
        const node:ExpressionNode = getNextNode(formulaStr, i);
        // 如果是立即数，则加入结果数组
        switch(node.type)
        {
            case EnumExpressionType.IMMEDIATE_VALUE:
                // 立即数要直接加入结果数组
                result.push(node);
                break;
            case EnumExpressionType.OPERATOR:
                // 操作符要判断是否括号
                switch(node.character)
                {
                    case ")":
                    case "]":
                    case "}":
                        // 是结束符，要出栈直到遇到匹配的运算符
                        while(true)
                        {
                            if(stack.length <= 0)
                            {
                                // 没找到匹配的起始节点，报错
                                throwFormulaError(formulaStr);
                            }
                            const tempNode:ExpressionNode = stack.pop();
                            if(tempNode.character === operatorEnd2StartDict[node.character])
                            {
                                // 匹配上了，跳出循环
                                break;
                            }
                            // 没有匹配上，将结果数组中最后两个立即数取出来，与符号生成新的立即数
                            if(result.length < 2)
                                throwFormulaError(formulaStr);
                            // 将符号栈顶元素和立即数栈顶2元素链接成新的立即数，放回结果数组
                            const valueB:ExpressionNode = result.pop();
                            const valueA:ExpressionNode = result.pop();
                            const value:ExpressionNode = calcTreeNode(tempNode, valueA, valueB);
                            result.push(value);
                        }
                        break;
                    default:
                        // 其他运算符，要将栈顶所有优先级不低于自己的符号出栈，与当前结果栈顶的立即数生成新的立即数后重新推入结果数组
                        while(stack.length > 0)
                        {
                            const topNode:ExpressionNode = stack[stack.length - 1];
                            const needPop:boolean = compareOperatorPriority(topNode.character, node.character) >= 0;
                            if(needPop)
                            {
                                // 将结果数组中最后两个立即数取出来，与符号生成新的立即数
                                if(result.length < 2)
                                    throwFormulaError(formulaStr);
                                // 将符号栈顶元素和立即数栈顶2元素链接成新的立即数，放回结果数组
                                const valueB:ExpressionNode = result.pop();
                                const valueA:ExpressionNode = result.pop();
                                const value:ExpressionNode = calcTreeNode(stack.pop(), valueA, valueB);
                                // 回推入结果数组
                                result.push(value);
                            }
                            else
                            {
                                // 栈顶符号优先级低于当前符号，跳出循环
                                break;
                            }
                        }
                        // 当前符号入栈
                        stack.push(node);
                        break;
                }
                break;
        }
        // 累加字符索引
        i += node.character.length;
    }
    // 结束扫描，如果栈中还有数据，则全部推入结果，但只能推入非括号的运算符
    while(stack.length > 0)
    {
        const tempNode:ExpressionNode = stack.pop();
        if(tempNode.type === EnumExpressionType.OPERATOR)
        {
            // 是运算符，判断是否括号
            if(isOperatableOperator(tempNode.character))
            {
                if(result.length < 2)
                    throwFormulaError(formulaStr);
                const valueB:ExpressionNode = result.pop();
                const valueA:ExpressionNode = result.pop();
                const value:ExpressionNode = calcTreeNode(tempNode, valueA, valueB);
                // 推入结果数组
                result.push(value);
            }
            else
            {
                // 是括号，报错
                throwFormulaError(formulaStr);
            }
        }
        else
        {
            // 不是运算符，报错
            throwFormulaError(formulaStr);
        }
    }
    // 如果结果数组中立即数数量不为1，则报错
    if(result.length !== 1)
        throwFormulaError(formulaStr);
    // 返回结果
    return result.pop();
}

/**
 * 根据中序表达式生成表达式树及其派生树
 *
 * @param {string} formulaStr 中序表达式
 * @returns {ExpressionNode[]} 表达式树根节点数组
 */
export function generateTrees(formulaStr:string):ExpressionNode[]
{
    const tree:ExpressionNode = generateTree(formulaStr);
    // 到这里已经生成了一个情况的表达式树，需要对相邻的优先级相同的符号位进行对调以扩展树状结构
    return deriveTree(tree);
}

/**
 * 判断对比两棵树
 *
 * @export
 * @param {ExpressionNode} treeA 第一棵树
 * @param {ExpressionNode} treeB 第二棵树
 * @returns {(number|null)} 0：两棵树相等；1：A树包含B树；-1：B树包含A树；null：两棵树无关
 */
export function judgeTree(treeA:ExpressionNode, treeB:ExpressionNode):number|null
{
    if(treeA.id === treeB.id) return 0;
    if(treeA.id.indexOf(treeB.id) >= 0) return 1;
    if(treeB.id.indexOf(treeA.id) >= 0) return -1;
    return null;
}

export function judgeTreeEvalEquals(treeA:ExpressionNode, treeB:ExpressionNode):boolean
{
    const evalA:ExpressionNode = evalTree(treeA)[0];
    const evalB:ExpressionNode = evalTree(treeB)[0];
    return judgeImmediateValueEquals(evalA, evalB);
}

/**
 * 判断一棵树是否完整约分过了
 *
 * @export
 * @param {ExpressionNode} tree 要判断的树
 * @returns {boolean} 是否经过完整约分
 */
export function judgeTreeDenomiatorReduced(tree:ExpressionNode):boolean
{
    // 获取约分树
    const newTree:ExpressionNode = traversalReduceFrac(tree);
    // 对比两棵树的特征值
    return newTree.id === tree.id;
}

/**
 * 复制表达式节点
 *
 * @param {ExpressionNode} node
 * @param {...ExpressionNode[]} subNodes 如果提供了某个子节点，则该子节点不进行复制，直接套用
 * @returns {ExpressionNode}
 */
function cloneExpressionNode(node:ExpressionNode, ...subNodes:ExpressionNode[]):ExpressionNode
{
    const result:ExpressionNode = {
        id: null,
        character: node.character,
        type: node.type,
        subNodes: node.subNodes.map((subNode:ExpressionNode, index:number)=>{
            return subNodes[index] || cloneExpressionNode(subNode);
        })
    };
    updateTreeId(result);
    return result;
}

/**
 * 报表达式解析错误
 *
 * @param {string} formulaStr 表达式字符串
 */
function throwFormulaError(formulaStr:string):void
{
    throw new Error("表达式解析错误：" + formulaStr);
}

const regLaTeXFrac:RegExp = /(\w*)\\frac{(\w+)}{(\w+)}/g;
const regFloatingNumber:RegExp = /(\d+)\.(\d+)/g;// 暂时不允许小数点前不写0
const regPureValue:RegExp = /\w+/g;
const operatorList:string[] = ["+", "-", "*", "/", "(", ")", "[", "]", "{", "}"];
const operatorEnd2StartDict:{[character:string]:string} = {
    ")": "(",
    "]": "[",
    "}": "{"
};

/**
 * 根据字符判断是否是运算符
 *
 * @param {string} character 运算符字符
 * @returns {boolean} 是否是运算符
 */
function isOperator(character:string):boolean
{
    return operatorList.indexOf(character) >= 0;
}

/**
 * 根据字符判断是否是可运算的运算符
 *
 * @param {string} character 运算符字符
 * @returns {boolean} 是否是可运算的运算符
 */
function isOperatableOperator(character:string):boolean
{
    // 先判断是否是运算符，不是的话就返回false
    if(!isOperator(character)) return false;
    // 再判断是否是括号运算符
    switch(character)
    {
        case "(":
        case ")":
        case "[":
        case "]":
        case "{":
        case "}":
            return false;
    }
    // 最后剩下的就是可运算的运算符
    return true;
}

const regOperatableOperator:RegExp = /[\+\-\*\/]/;
/**
 * 取得一棵树中的可运算符号数量
 *
 * @param {ExpressionNode} tree
 * @returns {number}
 */
function getOperatableOperatorCount(tree:ExpressionNode):number
{
    return tree.id.split(regOperatableOperator).length - 1;
}

/**
 * 是否为正向符号（+、*为正向）
 *
 * @param {string} character
 * @returns {boolean}
 */
function isOperatorPositive(character:string):boolean
{
    switch(character)
    {
        case "+":
        case "*":
            return true;
        default:
            return false;
    }
}

/**
 * 正向变负向，负向变正向
 *
 * @param {string} character
 * @returns {string}
 */
function toggleOperatorPositive(character:string):string
{
    switch(character)
    {
        case "+":
            return "-";
        case "-":
            return "+";
        case "*":
            return "/";
        case "/":
            return "*";
        default:
            throw new Error(character + "不是合法运算符");
    }
}

enum EnumOperatorPriority
{
    PLUS_MINUS = 1,
    TIMES_DIV = 2
}

/**
 * 获取运算符运算优先级，乘除法优先级为2，加减法优先级为1
 *
 * @param {string} character
 * @returns {number}
 */
function getOperatorPriority(character:string):number
{
    switch(character)
    {
        case "+":
        case "-":
            return EnumOperatorPriority.PLUS_MINUS;
        case "*":
        case "/":
            return EnumOperatorPriority.TIMES_DIV;
        default:
            throw new Error(character + "不是合法运算符");
    }
}

const operatorStartList:string[] = ["(", "[", "{"];
/**
 * 对比运算符优先级大小
 *
 * @param {string} a 第一个运算符
 * @param {string} b 第二个运算符
 * @returns {number} -1为a小于b，0为a等于b，1为a>b
 */
function compareOperatorPriority(a:string, b:string):number
{
    // 如果a或b不全是运算符，则报错
    if(!isOperator(a))
        throw new Error(a + "不是合法运算符");
    if(!isOperator(b))
        throw new Error(b + "不是合法运算符");
    const isStartOperatorA:boolean = operatorStartList.indexOf(a) >= 0;
    const isStartOperatorB:boolean = operatorStartList.indexOf(b) >= 0;
    // 如果ab都是左括号，则优先级相等
    if(isStartOperatorA && isStartOperatorB)
    {
        return 0;
    }
    else if(isStartOperatorA || isStartOperatorB)
    {
        // 如果ab有一个是左括号，则a优先级永远小于b
        return -1;
    }
    else
    {
        // 乘除法优先级大于加减法
        return getOperatorPriority(a) - getOperatorPriority(b);
    }
}

/**
 * 取出表达式中下一个表达式节点
 *
 * @param {string} formulaStr 表达式
 * @param {number} startIndex 开始扫描的索引
 * @returns {ExpressionNode} 组合好的表达式节点
 */
function getNextNode(formulaStr:string, startIndex:number):ExpressionNode
{
    // 先判断是否是LaTeX分数表达式
    regLaTeXFrac.lastIndex = startIndex;
    const resultLaTeXFrac:RegExpExecArray = regLaTeXFrac.exec(formulaStr);
    if(resultLaTeXFrac && resultLaTeXFrac.index === startIndex)
    {
        // 是以LaTeX分数开始的，返回整个LaTeX分数，LaTeX分数被认为是立即数
        return {
            id: resultLaTeXFrac[0],
            character: resultLaTeXFrac[0],
            type: EnumExpressionType.IMMEDIATE_VALUE,
            subNodes: []
        };
    }
    // 不是LaTeX开始的，先判断是否以运算符开始
    for(let operator of operatorList)
    {
        if(formulaStr.indexOf(operator, startIndex) === startIndex)
        {
            // 是以操作符开始的，返回操作符
            return {
                id: operator,
                character: operator,
                type: EnumExpressionType.OPERATOR,
                subNodes: []
            };
        }
    }
    // 判断是否是浮点数
    regFloatingNumber.lastIndex = startIndex;
    const resultFloatingNumber:RegExpExecArray = regFloatingNumber.exec(formulaStr);
    if(resultFloatingNumber && resultFloatingNumber.index === startIndex)
    {
        // 是以浮点数开始的，返回立即数结构
        return {
            id: resultFloatingNumber[0],
            character: resultFloatingNumber[0],
            type: EnumExpressionType.IMMEDIATE_VALUE,
            subNodes: []
        };
    }
    // 最后判断是否是立即数
    regPureValue.lastIndex = startIndex;
    const resultPureValue:RegExpExecArray = regPureValue.exec(formulaStr);
    if(resultPureValue && resultPureValue.index === startIndex)
    {
        // 是纯数字或字母，返回立即数
        return {
            id: resultPureValue[0],
            character: resultPureValue[0],
            type: EnumExpressionType.IMMEDIATE_VALUE,
            subNodes: []
        };
    }
    // 都不是，报错
    throwFormulaError(formulaStr);
}

const regBlankCharacter:RegExp = /\s+/g;
/**
 * 去除字符串中所有空白字符
 *
 * @param {string} str 要去除空白字符的字符串
 * @returns {string} 去除了空白字符的字符串
 */
function trimBlankCharacters(str:string):string
{
    return str.replace(regBlankCharacter, "");
}

function updateTreeId(tree:ExpressionNode):void
{
    tree.id = `${tree.subNodes.map(subNode=>subNode.id).join("|")}${tree.character}`;
}

function calcTreeNode(parent:ExpressionNode, ...subNodes:ExpressionNode[]):ExpressionNode
{
    parent.subNodes = subNodes;
    parent.type = EnumExpressionType.OPERATOR;
    updateTreeId(parent);
    return parent;
}

function cloneTree(tree:ExpressionNode, subTree:ExpressionNode, subIndex:number):ExpressionNode
{
    const tempSubNodes:ExpressionNode[] = [];
    tempSubNodes[subIndex] = subTree;
    tempSubNodes.length = subIndex + 1;
    const clonedTree:ExpressionNode = cloneExpressionNode(tree, ...tempSubNodes);
    return clonedTree;
}

function removeDuplicateTrees(trees:ExpressionNode[]):number
{
    const cache:{[id:string]:true} = {};
    let len:number = trees.length;
    for(let i:number = 0; i < len; i++)
    {
        const subNode:ExpressionNode = trees[i];
        if(cache[subNode.id])
        {
            // 去掉重复树
            trees.splice(i, 1);
            i --;
            len --;
        }
        else
        {
            // 加入缓存
            cache[subNode.id] = true;
        }
    }
    return len;
}

const primeList:number[] = [];
/**
 * 分解质因数
 *
 * @param {number} value 数字
 * @returns {number[]} 质因数集合，小于2的数字和非整数没有质因数
 */
function primeFactorization(value:number):number[]
{
    // 首先判断是否是大于1的整数
    if(value < 2 || value % 1 !== 0) return [];
    // 设置遍历阈值，使用给定值的开方向下取整
    const maxValue:number = Math.floor(Math.sqrt(value));
    let maxCachedPrime:number = primeList[primeList.length - 1] || 0;
    // 开始分解一步
    let prime:number = -1;
    let curPrime:number = 1;
    // 首先要遍历质数列表
    for(curPrime of primeList)
    {
        // 判断是否超过阈值了
        if(curPrime > maxValue)
            break;
        // 判断是否能整除
        if(value % curPrime === 0)
        {
            // 记录质因数，跳出循环
            prime = curPrime;
            break;
        }
    }
    // 如果没找出质因数，则要采用+1策略继续寻找直到达到阈值为止
    if(prime < 0)
    {
        while(++curPrime <= maxValue)
        {
            // 首先要判断当前的临时因数是否大于最大缓存的质数
            if(curPrime > maxCachedPrime)
            {
                // 大于最大缓存质数了，判断是否也是质数
                const tempPrimes:number[] = primeFactorization(curPrime);
                if(tempPrimes.length === 1)
                {
                    // 是质数，记录最大缓存过的质数
                    maxCachedPrime = tempPrimes[0];
                    // 将质数推入数组
                    primeList.push(maxCachedPrime);
                }
            }
            // 然后判断是否可以被整除
            if(value % curPrime === 0)
            {
                prime = curPrime;
                break;
            }
        }
    }
    // 判断是否找到了质因数
    if(prime < 0)
    {
        // 没找到，value是个质数，返回质数本身的数组
        return [value];
    }
    else
    {
        // 找到了一个质因数，尝试放入缓存
        if(prime > maxCachedPrime)
        {
            // 还没缓存过，推入缓存
            primeList.push(prime);
        }
        // 递归
        const leftPrimes:number[] = primeFactorization(value / prime);
        leftPrimes.unshift(prime);
        return leftPrimes;
    }
}

/**
 * 计算最大公约数
 *
 * @param {...number[]} values
 * @returns {number}
 */
function calcGCD(...values:number[]):number
{
    return values.reduce((prev:number, cur:number)=>{
        let gcd:number = 1;
        // 分解A的质因数
        const primes:number[] = primeFactorization(prev);
        // 遍历A的质因数集合，试除B
        for(let prime of primes)
        {
            // 如果B可以整除这个质因数，则gcd与之相乘
            if(cur % prime === 0)
            {
                gcd *= prime;
                cur /= prime;
            }
        }
        return gcd;
    });
}

/**
 * 计算最小公倍数
 *
 * @param {...number[]} values
 * @returns {number}
 */
function calcLCM(...values:number[]):number
{
    return values.reduce((prev:number, cur:number)=>{
        // 先算出最大公约数
        const gcd:number = calcGCD(prev, cur);
        // 两数字相乘，再除以最大公约数，即为最小公倍数。为了防止越界，先除后乘
        return prev / gcd * cur;
    });
}

const regFracOrInteger:RegExp = /^(\w*)(\\frac{(\w+)}{(\w+)})$/;

/**
 * 分解分数
 *
 * @param {string} str
 * @returns {[number, number, number]|null} 整数、分子、分母
 */
function parseFrac(str:string):[number, number, number]|null
{
    const result:RegExpExecArray = regFracOrInteger.exec(str);
    if(!result) return null;
    let integer:number = parseInt(result[1] || "0");
    let numerator:number = parseInt(result[3] || "0");
    let denominator:number = parseInt(result[4] || "1");
    return [integer, numerator, denominator];
}

function stringifyFrac(value:[number, number, number]):string
{
    if(value[1] === 0)
        return value[0] + "";
    else
        return `${value[0] || ""}\\frac{${value[1]}}{${value[2]}}`;
}

/**
 * 约分
 *
 * @param {string} frac
 * @returns {(string|null)}
 */
function reduceFrac(frac:[number, number, number]):[number, number, number]|null
{
    if(!frac) return null;
    let integer:number = frac[0];
    let numerator:number = frac[1];
    let denominator:number = frac[2];
    // 如果分子是0，认为没有分数部分，直接返回整数部分
    if(numerator === 0)
        return [integer, 0, 1];
    // 如果分子大于等于分母，则应该先将分子化为小于分母的情况
    if(numerator >= denominator)
    {
        const temp:number = numerator / denominator;
        const tempInteger:number = Math.floor(temp);
        integer += tempInteger;
        numerator -= denominator * tempInteger;
    }
    // 如果分子为0，则直接返回整数
    if(numerator === 0) return [integer, 0, 1];
    // 获取分子和分母的最大公约数
    const gcd:number = calcGCD(numerator, denominator);
    // 返回分数结果
    return [integer, numerator / gcd, denominator / gcd];
}

/**
 * 通分
 *
 * @param {string} fracA
 * @param {string} fracB
 * @returns {[string, string]}
 */
function commonDenominator(...fracs:[number, number, number][]):[number, number, number][]
{
    // 求多个分数分母的最小公倍数
    const lcmDenominator:number = calcLCM(...fracs.map(frac=>frac[2]));
    // 每个分数分别通分
    return fracs.map(frac=>{
        const newFrac:[number, number, number] = [
            frac[0],
            lcmDenominator / frac[2] * frac[1],
            lcmDenominator
        ];
        return newFrac;
    });
}

/**
 * 将任何分数变为假分数，整数还保持整数形式
 *
 * @param {[number, number, number]} frac
 * @returns {[number, number, number]}
 */
function toImproperFrac(frac:[number, number, number]):[number, number, number]
{
    return [0, frac[1] + frac[0] * frac[2], frac[2]];
}

/**
 * 浮点数变分数
 *
 * @param {string} floatStr
 * @returns {string|null} null表示不能转换为分数
 */
function floatToFrac(floatStr:string):[number, number, number]|null
{
    // 先判断是否为浮点数
    const value:number = parseFloat(floatStr);
    if(!isNaN(value))
    {
        // 获取整数部分
        const integer:number = Math.floor(value);
        const floatLen:number = (floatStr.split(".")[1] || "").length;
        // 获取浮点数部分
        const denominator:number = Math.pow(10, floatLen);
        const float:number = Math.round((value - integer) * denominator);
        // 生成经过约分的LaTeX形式分数
        return reduceFrac([integer, float, denominator]);
    }
    return null;
}

function generateWithSubNodes(operator:string, ...subNodes:ExpressionNode[]):ExpressionNode
{
    const node:ExpressionNode = {
        id: null,
        character: operator,
        type: EnumExpressionType.OPERATOR,
        subNodes: subNodes
    };
    updateTreeId(node);
    return node;
}

function generateImmediateValue(value:string):ExpressionNode
{
    return {
        id: value,
        character: value,
        type: EnumExpressionType.IMMEDIATE_VALUE,
        subNodes: []
    };
}

function generateFracNode(frac:[number, number, number]):ExpressionNode
{
    const fracStr:string = stringifyFrac(frac);
    return {
        id: fracStr,
        character: fracStr,
        type: EnumExpressionType.IMMEDIATE_VALUE,
        subNodes: []
    };
}

function judgeImmediateValueEquals(nodeA:ExpressionNode, nodeB:ExpressionNode):boolean
{
    if(nodeA.type !== EnumExpressionType.IMMEDIATE_VALUE || nodeB.type !== EnumExpressionType.IMMEDIATE_VALUE)
        return false;
    // 都变成分数进行对比
    const fracA:[number, number, number] = parseFrac(nodeA.character) || floatToFrac(nodeA.character);
    const fracB:[number, number, number] = parseFrac(nodeB.character) || floatToFrac(nodeB.character);
    return judgeFracEquals(fracA, fracB);
}

function judgeFracEquals(fracA:[number, number, number], fracB:[number, number, number]):boolean
{
    if(!fracA || !fracB) return false;
    // 约分
    fracA = reduceFrac(fracA);
    fracB = reduceFrac(fracB);
    return fracA[0] === fracB[0] && fracA[1] === fracB[1] && fracA[2] === fracB[2];
}

/**
 * 派生分数树为浮点数树
 *
 * @param {ExpressionNode} tree 要派生的原始数
 * @returns {ExpressionNode[]} 派生的等价树列表
 */
function deriveFracFloat(tree:ExpressionNode):ExpressionNode[]
{
    const result:ExpressionNode[] = [tree];
    // 节点必须是立即数，否则不做派生
    if(tree.type !== EnumExpressionType.IMMEDIATE_VALUE)
        return result;
    // 如果节点的值是个小数，就先转成分数再派生
    const tempFrac:[number, number, number] = parseFrac(tree.character) || floatToFrac(tree.character);
    // 将当前分数结果推入结果
    result.push(generateFracNode(tempFrac));
    // 约分
    const frac:[number, number, number] = reduceFrac(tempFrac);
    // 获取假分数数据
    const improperFrac:[number, number, number] = toImproperFrac(frac);
    // 假分数数据是一定要在结果里的
    result.push(generateFracNode(improperFrac));
    // 如果带分数的整数部分不是0，则也要把带分数情况推进去
    if(frac[0] !== improperFrac[0] || frac[1] !== improperFrac[1] || frac[2] !== improperFrac[2])
    {
        result.push(generateFracNode(frac));
        // 还要推入一个加法的情况
        result.push(generateWithSubNodes("+", generateImmediateValue(frac[0] + ""), generateFracNode([0, frac[1], frac[2]])));
    }
    // 尝试将分数转化为浮点数
    const value:number = improperFrac[1] / improperFrac[2];
    // 判断是否除尽，目前使用浮点数长度不超过10位这个条件
    const valueStr:string = value + "";
    const floatStr:string = valueStr.split(".")[1];
    // 如果是个浮点数且能除尽，添加派生结果。否则就不加了
    if(floatStr && floatStr.length <= 10)
    {
        result.push({
            id: valueStr,
            character: valueStr,
            type: EnumExpressionType.IMMEDIATE_VALUE,
            subNodes: []
        });
    }
    // 去重
    removeDuplicateTrees(result);
    // 返回结果
    return result;
}

/**
 * 处理分配率以派生等价树
 *
 * @param {ExpressionNode} tree 要派生的原始数
 * @returns {ExpressionNode[]} 派生的等价树列表
 */
function deriveDistribution(tree:ExpressionNode):ExpressionNode[]
{
    // 自己也要算是一个派生结果
    const result:ExpressionNode[] = [tree];
    // 先判断是否是可计算的运算符
    if(isOperatableOperator(tree.character))
    {
        switch(getOperatorPriority(tree.character))
        {
            // 正向分配，如果父级是个乘除法符号
            case EnumOperatorPriority.TIMES_DIV:
                // 遍历子节点
                for(let i:number = 0, len:number = tree.subNodes.length; i < len; i++)
                {
                    const subTree:ExpressionNode = tree.subNodes[i];
                    // 如果子节点是个加减法符号，且不能是右子树且父节点为除号的情况（后面情况举例：a/(b+c)不能使用分配率）
                    if(
                        isOperatableOperator(subTree.character) &&
                        getOperatorPriority(subTree.character) === EnumOperatorPriority.PLUS_MINUS &&
                        !(
                            i === 1 &&
                            tree.character === "/"
                        )
                    ) {
                        // 可以使用正向分配率，将子树提升为新父树，父树降级复制为2个新子树，并将新父树两个子节点使用新子树的运算降级为孙节点
                        const newSubTreeA:ExpressionNode = cloneTree(tree, subTree.subNodes[0], i);
                        const newSubTreeB:ExpressionNode = cloneTree(tree, subTree.subNodes[1], i);
                        const newTree:ExpressionNode = cloneExpressionNode(subTree, newSubTreeA, newSubTreeB);
                        result.push(newTree);
                    }
                }
                break;
            // 反向分配，如果父级是个加减法符号
            case EnumOperatorPriority.PLUS_MINUS:
                // 首先必须有2个子节点
                if(tree.subNodes.length === 2)
                {
                    // 先判断某一边是乘号或除号
                    for(let i:number = 0, lenI:number = tree.subNodes.length; i < lenI; i++)
                    {
                        const subTreeA:ExpressionNode = tree.subNodes[i];
                        if(
                            isOperatableOperator(subTreeA.character) &&
                            getOperatorPriority(subTreeA.character) === EnumOperatorPriority.TIMES_DIV
                        ) {
                            const subTreeB:ExpressionNode = tree.subNodes[1 - i];
                            // 再判断是否两个符号相同
                            if(subTreeA.character === subTreeB.character)
                            {
                                // 再次判断，两棵子树的左子树或右子树的特征值必须相同
                                for(let i:number = 0, len:number = subTreeA.subNodes.length; i < len; i++)
                                {
                                    if(judgeTree(subTreeA.subNodes[i], subTreeB.subNodes[i]) === 0)
                                    {
                                        // 可以使用反向分配率，将父树降级为新子树，左右节点分别为2棵子树的另一子树；将其中一棵子树升级为新父树，另一节点为新子树
                                        const newSubTree:ExpressionNode = cloneExpressionNode(tree, subTreeA.subNodes[1 - i], subTreeB.subNodes[1 - i]);
                                        // 将新父树推入结果
                                        const newTree:ExpressionNode = cloneTree(subTreeA, newSubTree, 1 - i);
                                        result.push(newTree);
                                    }
                                }
                            }
                            else
                            {
                                // 或者另一边的特征值与这边某一子节点特征值相同
                                for(let j:number = 0, lenJ:number = subTreeA.subNodes.length; j < lenJ; j++)
                                {
                                    if(subTreeB.id === subTreeA.subNodes[j].id)
                                    {
                                        // 必须是乘号，或者是除号但是是左子树
                                        if(subTreeA.character === "*" || (subTreeA.character === "/" && j === 0))
                                        {
                                            // 把另一边扩展为*1的情况，再进行反向分配率
                                            const newSubTreeB:ExpressionNode = {
                                                id: null,
                                                type: EnumExpressionType.OPERATOR,
                                                character: subTreeA.character,
                                                subNodes: [
                                                    {
                                                        id: "1",
                                                        type: EnumExpressionType.IMMEDIATE_VALUE,
                                                        character: "1",
                                                        subNodes: []
                                                    }
                                                ]
                                            };
                                            if(j === 0)
                                                newSubTreeB.subNodes.unshift(subTreeB);
                                            else
                                                newSubTreeB.subNodes.push(subTreeB);
                                            updateTreeId(newSubTreeB);
                                            // 复制父树
                                            const newTree:ExpressionNode = cloneTree(tree, newSubTreeB, 1 - i);
                                            const newDeriveTrees:ExpressionNode[] = deriveDistribution(newTree);
                                            // 将新父树的派生树都推到结果中
                                            result.push.apply(result, newDeriveTrees);
                                            break;
                                        }
                                    }
                                }
                            }
                            // 跳出，最多只匹配1次
                            break;
                        }
                    }
                }
                break;
        }
    }
    // 去重
    removeDuplicateTrees(result);
    // 返回结果
    return result;
}

/**
 * 处理结合律以派生等价树
 *
 * @param {ExpressionNode} tree 要派生的原始数
 * @returns {ExpressionNode[]} 派生的等价树列表
 */
function deriveAssociation(tree:ExpressionNode):ExpressionNode[]
{
    // 自己也要算是一个派生结果
    const result:ExpressionNode[] = [tree];
    // 每次递归只判断根节点与子节点之间的关系
    for(let i:number = 0, len:number = tree.subNodes.length; i < len; i++)
    {
        const subTree:ExpressionNode = tree.subNodes[i];
        // 如果父子两个都是可计算符号，且运算优先级相同，则需要处理结合律
        if(
            isOperatableOperator(subTree.character) &&
            isOperatableOperator(tree.character) &&
            compareOperatorPriority(subTree.character, tree.character) === 0
        ) {
            // 优先级相同，复制树和子树
            const newSubTree:ExpressionNode = cloneExpressionNode(tree);
            const newTree:ExpressionNode = newSubTree.subNodes[i];
            // 对调父子关系
            newSubTree.subNodes[i] = newTree.subNodes[1 - i];
            newTree.subNodes[1 - i] = newSubTree;
            // 如果对调的是左子树且子树运算符为负向，则新子树要改变符号
            if(i === 0 && !isOperatorPositive(subTree.character))
            {
                newSubTree.character = toggleOperatorPositive(newSubTree.character);
            }
            // 如果对调的是右子树且父树运算符为负向，则新父树要改变符号
            if(i === 1 && !isOperatorPositive(tree.character))
            {
                newTree.character = toggleOperatorPositive(newTree.character);
            }
            // 更新新子树ID
            updateTreeId(newSubTree);
            // 更新新父树ID
            updateTreeId(newTree);
            // 将结合律等价树推入结果
            result.push(newTree);
            // 还要处理原树和新树的子树double情况
            doubleSubSubTree(tree, subTree, i);
            doubleSubSubTree(newTree, newSubTree, 1 - i);
        }
    }
    // 去重
    removeDuplicateTrees(result);
    // 返回结果
    return result;

    function doubleSubSubTree(tree:ExpressionNode, subTree:ExpressionNode, subIndex:number):void
    {
        const newSubTree:ExpressionNode = deriveDoubleSubTree(subTree)[1];
        if(newSubTree)
        {
            // 生成新树
            const newTree:ExpressionNode = cloneTree(tree, newSubTree, subIndex);
            const newDeriveTrees:ExpressionNode[] = deriveTree(newTree);
            // 将派生结果推入结果
            result.push.apply(result, newDeriveTrees);
        }
    }
}

/**
 * 处理交换律以派生等价树
 *
 * @param {ExpressionNode} tree 要派生的原始数
 * @returns {ExpressionNode[]} 派生的等价树列表
 */
function deriveCommutation(tree:ExpressionNode):ExpressionNode[]
{
    // 自己也要算是一个派生结果
    const result:ExpressionNode[] = [tree];
    // 如果是正向符号，则将两个子树对调形成交换树
    if(isOperatorPositive(tree.character))
    {
        const commutateTree:ExpressionNode = cloneExpressionNode(tree, tree.subNodes[1], tree.subNodes[0]);
        // 将交换树加入结果数组
        result.push(commutateTree);
    }
    // 去重
    removeDuplicateTrees(result);
    // 返回派生树列表
    return result;
}

function deriveDoubleSubTree(tree:ExpressionNode):ExpressionNode[]
{
    const result:ExpressionNode[] = [tree];
    // 如果子树是两个相同特征值相加，则派生一个*2的树放到result里
    if(tree.character === "+" && tree.subNodes[0].id === tree.subNodes[1].id)
    {
        const tempSubNode:ExpressionNode = tree.subNodes[0];
        const newSubTree:ExpressionNode = {
            id: null,
            type: EnumExpressionType.OPERATOR,
            character: "*",
            subNodes: [
                tempSubNode,
                {
                    id: "2",
                    type: EnumExpressionType.IMMEDIATE_VALUE,
                    character: "2",
                    subNodes: []
                }
            ]
        };
        updateTreeId(newSubTree);
        // 推入结果
        result.push(newSubTree);
    }
    return result;
}

/**
 * 处理子树以派生等价树
 *
 * @param {ExpressionNode} tree 要派生的原始数
 * @returns {ExpressionNode[]} 派生的等价树列表
 */
function deriveSubTrees(tree:ExpressionNode):ExpressionNode[]
{
    const result:ExpressionNode[] = [tree];
    // 先将当前结果都放入缓存
    const tempCache:{[id:string]:true} = {
        [tree.id]: true
    };
    // 对每个派生树的子节点进行递归派生
    for(let subIndex:number = 0, subLen:number = tree.subNodes.length; subIndex < subLen; subIndex++)
    {
        const subTree:ExpressionNode = tree.subNodes[subIndex];
        const subDeriveResult:ExpressionNode[] = deriveTree(subTree);
        // 每个子树的派生都会产生一个全新的派生树，因此要将新派生的树推回派生树数组，让后续派生可以遍历到
        for(let deriveSubTree of subDeriveResult)
        {
            const derivedTree:ExpressionNode = cloneTree(tree, deriveSubTree, subIndex);
            // 已派生过的就不再派生了
            if(!tempCache[derivedTree.id])
            {
                tempCache[derivedTree.id] = true;
                result.push(derivedTree);
            }
        }
    }
    return result;
}

// 这里做个缓存，将所有已经计算过派生树的结果缓存起来，以提高后续子树解析效率，即为机器学习
// 如果将这套算法放到服务器上，并将这个缓存对象持久化，则随着时间推移效率会越来越高
const deriveCache:{[id:string]:ExpressionNode[]} = {};

function deriveHelper(result:ExpressionNode[], handler:(tree:ExpressionNode)=>ExpressionNode[]):void
{
    const cache:{[id:string]:true} = {};
    // 这里要先清空result再遍历
    const tempTrees:ExpressionNode[] = result.splice(0, result.length);
    for(let tempTree of tempTrees)
    {
        const tempDeriveTrees:ExpressionNode[] = handler(tempTree);
        // 这里要用push，因为不能改变result在缓存中的引用
        for(let tempDeriveTree of tempDeriveTrees)
        {
            if(!cache[tempDeriveTree.id])
            {
                cache[tempDeriveTree.id] = true;
                result.push(tempDeriveTree);
            }
        }
    }
}

function cacheResult(result:ExpressionNode[]):void
{
    // 将所有派生树结果都缓存起来
    for(let deriveTree of result)
    {
        deriveCache[deriveTree.id] = result;
    }
}

/**
 * 对一个树进行派生，分别应用结合律、交换律、分配率
 * 三个规律的顺序要求为：分配率先于结合律先于交换律，因为交换律没有任何副作用
 *
 * @param {ExpressionNode} tree 要派生的树
 * @returns {ExpressionNode[]} 派生的等价树列表
 */
function deriveTree(tree:ExpressionNode):ExpressionNode[]
{
    // 先判断是否在缓存里，是的话直接返回缓存数据。必须有缓存，以避免循环解析
    const cachedResult:ExpressionNode[] = deriveCache[tree.id];
    if(cachedResult) return cachedResult;
    // 先把当前树放到结果中并缓存
    const result:ExpressionNode[] = deriveCache[tree.id] = [tree];
    // 处理交换律
    deriveHelper(result, deriveCommutation);
    // 处理子节点递归
    deriveHelper(result, deriveSubTrees);
    // 先处理分配率，分配率要处理2次，一次正向一次反向
    deriveHelper(result, deriveDistribution);
    deriveHelper(result, deriveDistribution);
    // 处理子节点递归
    deriveHelper(result, deriveSubTrees);
    // 处理结合律
    deriveHelper(result, deriveAssociation);
    // 处理double情况
    deriveHelper(result, deriveDoubleSubTree);
    // 处理子节点递归
    deriveHelper(result, deriveSubTrees);
    // 处理交换律
    deriveHelper(result, deriveCommutation);
    // 处理子节点递归
    deriveHelper(result, deriveSubTrees);
    // 将所有派生树结果都缓存起来
    cacheResult(result);
    // 返回最终派生结果
    return result;
}