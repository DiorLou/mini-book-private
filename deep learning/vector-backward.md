# 向量反向传播：`backward()` 为什么需要梯度参数

## 问题背景

标量损失可以直接调用 `loss.backward()`，但向量 `y` 调用 `y.backward()` 会要求传入一个同形状张量，例如 `torch.ones_like(y)`。原因在于向量对向量的导数不是一个普通梯度向量。

## 一个具体例子

```python
import torch

x = torch.linspace(-2, 2, 5, requires_grad=True)
y = torch.relu(x)
y.backward(torch.ones_like(y))
print(x.grad)
```

## 标量输出：默认反向种子为 1

当 $L$ 是标量时，`L.backward()` 隐式使用 $\nabla_L L=1$ 作为反向传播起点，因此不需要额外参数。

## 向量输出：完整导数是雅可比矩阵

若 $\mathbf y=f(\mathbf x)$，其完整导数是**雅可比矩阵（Jacobian Matrix）**：

$$
J_{ij}=\nabla_{x_j}y_i
$$

PyTorch 的反向模式自动微分不会默认构造整张雅可比矩阵，而是高效计算一个**向量—雅可比积（Vector–Jacobian Product, VJP）**。

## `ones_like`：把向量输出求和

传入向量 $\mathbf v$ 时，`backward(v)` 计算 $\mathbf v^T J$。若 $\mathbf v$ 全为 1，就等价于先构造标量：

$$
L=\sum_i y_i
$$

再计算 $\nabla_{\mathbf x}L$。

## 回到原问题

`torch.ones_like(y)` 不是“让 PyTorch 分别返回每个导数”的特殊开关，而是在定义各输出分量如何加权合成一个标量目标。换成其他权重，得到的 VJP 也会不同。

## 要点小结

- 标量可以直接反向传播，因为反向种子天然是 1。
- 向量输出的导数是雅可比矩阵，`backward(v)` 实际计算 VJP。
- 全 1 权重等价于对所有输出求和后再求导。
