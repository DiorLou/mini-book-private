# 正向传播与反向传播：训练一次发生了什么

## 问题背景

训练代码通常只有 `net(X)`、`loss(...)`、`backward()` 和 `step()` 几行，但这些指令分别承担什么职责、为什么必须按顺序执行并不直观。

## 一个最小训练步骤

```python
optimizer.zero_grad()
y_hat = net(X)
loss = criterion(y_hat, y)
loss.backward()
optimizer.step()
```

## 正向传播：计算预测和损失

**正向传播（Forward Propagation）**让数据依次经过网络中的运算，根据当前参数得到预测 $\hat y$，再由损失函数得到标量 $L$。正向计算同时记录产生各张量的运算关系，为后续求导建立计算图。

## 反向传播：沿计算图应用链式法则

**反向传播（Backward Propagation）**从损失开始，反向组合每个运算的局部导数。若网络的一段关系为：

$$
x\rightarrow u=wx\rightarrow y=\sigma(u)\rightarrow L
$$

则参数梯度为：

$$
\nabla_w L
=\nabla_y L
\cdot\nabla_u y
\cdot\nabla_w u
$$

这就是**链式法则（Chain Rule）**在计算图上的高效复用。

## 参数更新：梯度不是更新本身

`loss.backward()` 只负责把梯度写入参数的 `.grad`；`optimizer.step()` 才根据优化规则修改参数。以最简单的梯度下降为例：

$$
w\leftarrow w-\eta\nabla_w L
$$

## 回到原问题

这几行代码不能任意调换：必须先得到损失和计算图，才能反向求梯度；必须先得到梯度，优化器才能更新参数；新一轮训练前还要清除上一轮累积的梯度。

## 要点小结

- 正向传播产生预测、损失和计算图。
- 反向传播计算梯度，但不直接更新参数。
- 优化器读取 `.grad` 后才真正修改参数。
