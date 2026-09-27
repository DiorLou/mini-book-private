# Autograd：计算图、叶子张量与梯度累加

## 问题背景

连续两次调用 `backward()` 后，`x.grad` 为什么会从 4 变成 8，而不是仍然等于 4？理解这个现象需要区分梯度计算和梯度存储。

## 一个具体例子

```python
import torch

x = torch.tensor(2.0, requires_grad=True)

y = x ** 2
y.backward()
print(x.grad)  # tensor(4.)

y2 = x ** 2
y2.backward()
print(x.grad)  # tensor(8.)
```

## 动态计算图：记录运算依赖

**Autograd**是 PyTorch 的自动求导引擎。正向运算时，它建立一张**有向无环图（Directed Acyclic Graph, DAG）**：节点代表张量或运算，边表示数据依赖。反向传播会按相反方向遍历这张图。

## 叶子张量：梯度最终存放的位置

用户直接创建且设置 `requires_grad=True` 的张量通常是**叶子张量（Leaf Tensor）**。反向传播计算完成后，其梯度被存入 `.grad`。中间张量虽然参与链式法则，默认却不会长期保留 `.grad`。

## 梯度累加：为什么需要清零

PyTorch 对 `.grad` 执行累加而不是覆盖。这允许多个损失或多个小批量贡献共同累积梯度，但也意味着常规训练中必须在新一轮反向传播前调用：

```python
optimizer.zero_grad()
```

## 计算图释放

完成反向传播后，图中为求导保存的中间结果通常会被释放。确实需要在同一张图上再次反向传播时才使用 `retain_graph=True`；日常训练不应无故保留，以免增加内存占用。

## 回到原问题

示例中每次 $x^2$ 对 $x=2$ 的导数都是 4，但第二次结果被加到原有 `.grad` 上，因此得到 8。问题不在求导公式，而在 `.grad` 的累加语义。

## 要点小结

- `requires_grad=True` 决定是否追踪相关运算。
- `backward()` 将梯度累加到叶子张量的 `.grad`。
- 常规训练要先 `zero_grad()`，重复使用同一张图才考虑 `retain_graph=True`。
