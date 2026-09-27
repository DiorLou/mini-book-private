# `CrossEntropyLoss`：为什么直接接收 Logits

## 问题背景

使用 PyTorch 做多分类时，模型输出通常直接传给 `nn.CrossEntropyLoss`，不需要先手动调用 Softmax。疑问是：概率还没有显式算出来，交叉熵如何计算？

## 一个具体例子

```python
import torch
import torch.nn.functional as F

logits = torch.tensor([[2.0, 1.0, 0.1],
                       [1.0, 5.0, 0.2]])
target = torch.tensor([0, 1])

official = F.cross_entropy(logits, target)
manual = F.nll_loss(F.log_softmax(logits, dim=1), target)

print(torch.allclose(official, manual))  # True
```

## Logits：尚未归一化的分类分数

**Logits**是模型最后一层输出的原始分数。它们可以是任意实数，不要求落在 $[0,1]$，总和也不要求为 1。

## LogSoftmax 与 NLLLoss：两个步骤的融合

PyTorch 的多分类交叉熵可以理解为：

```text
CrossEntropyLoss = LogSoftmax + NLLLoss
```

`LogSoftmax` 把 Logits 转成对数概率，`NLLLoss` 再按照整数标签索引取出真实类别对应的负对数概率。

## Log-Sum-Exp：数值稳定性的来源

直接计算 `log(softmax(x))` 可能先产生极大的 `exp(x)`，或者得到接近 0 的概率后再遇到 `log(0)`。融合实现使用**Log-Sum-Exp 技巧**，先减去最大 Logit，再完成等价计算，从而避免上溢和下溢。

## 回到原问题

`CrossEntropyLoss` 不是跳过了 Softmax，而是把 Softmax 的对数形式和负对数似然融合在一个数值稳定的运算中。因此应传入原始 Logits；如果先手动 Softmax，就会改变函数预期的输入含义。

## 要点小结

- `CrossEntropyLoss` 接收 Logits，而不是已经归一化的概率。
- 整数类别标签由 NLLLoss 用作索引，不需要手动转成独热向量。
- 融合实现既简洁，也比先 Softmax 再取对数更稳定。
