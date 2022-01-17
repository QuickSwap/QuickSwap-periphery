import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { AddressZero, Zero, MaxUint256 } from 'ethers/constants'
import { BigNumber, bigNumberify } from 'ethers/utils'
import { solidity, MockProvider, createFixtureLoader } from 'ethereum-waffle'
import { ecsign } from 'ethereumjs-util'

import { expandTo18Decimals, getApprovalDigest, mineBlock, MINIMUM_LIQUIDITY } from './shared/utilities'
import { v2Fixture } from './shared/fixtures'

chai.use(solidity)

const overrides = {
  gasLimit: 9999999
}

enum RouterVersion {
  QuickSwapLiquidityRouter = 'QuickSwapLiquidityRouter'
}

describe('QuickSwapLiquidityRouter', () => {
  for (const routerVersion of Object.keys(RouterVersion)) {
    const provider = new MockProvider({
      hardfork: 'istanbul',
      mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
      gasLimit: 9999999
    })
    const [wallet] = provider.getWallets()
    const loadFixture = createFixtureLoader(provider, [wallet])

    let token0: Contract
    let token1: Contract
    let WETH: Contract
    let WETHPartner: Contract
    let factory: Contract
    let router: Contract
    let pair: Contract
    let WETHPair: Contract
    let routerEventEmitter: Contract
    let lpStakerContract: Contract
    let stakingRewards: Contract
    beforeEach(async function() {
      const fixture = await loadFixture(v2Fixture)
      token0 = fixture.token0
      token1 = fixture.token1
      WETH = fixture.WETH
      WETHPartner = fixture.WETHPartner
      lpStakerContract = fixture.lpStakerContract
      stakingRewards = fixture.stakingRewards
      factory = fixture.factoryV2
      router = {
        [RouterVersion.QuickSwapLiquidityRouter]: fixture.quickSwapLiquidityRouter
      }[routerVersion as RouterVersion]
      pair = fixture.pair
      WETHPair = fixture.WETHPair
      routerEventEmitter = fixture.routerEventEmitter
    })

    afterEach(async function() {
      expect(await provider.getBalance(router.address)).to.eq(Zero)
    })

    describe(routerVersion, () => {
      it('factory, WETH', async () => {
        expect(await router.factory()).to.eq(factory.address)
        expect(await router.WETH()).to.eq(WETH.address)
      })

      it('addLiquidity', async () => {
        const token0Amount = expandTo18Decimals(1)
        const token1Amount = expandTo18Decimals(4)

        const expectedLiquidity = expandTo18Decimals(2)
        await token0.approve(router.address, MaxUint256)
        await token1.approve(router.address, MaxUint256)
        await expect(
          router.addLiquidity(
            token0.address,
            token1.address,
            token0Amount,
            token1Amount,
            0,
            0,
            wallet.address,
            MaxUint256,
            overrides
          )
        )
          .to.emit(token0, 'Transfer')
          .withArgs(wallet.address, pair.address, token0Amount)
          .to.emit(token1, 'Transfer')
          .withArgs(wallet.address, pair.address, token1Amount)
          .to.emit(pair, 'Transfer')
          .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
          .to.emit(pair, 'Transfer')
          .withArgs(AddressZero, wallet.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(pair, 'Sync')
          .withArgs(token0Amount, token1Amount)
          .to.emit(pair, 'Mint')
          .withArgs(router.address, token0Amount, token1Amount)

        expect(await pair.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      })

      it('addAndStakeLiquidity', async () => {
        const token0Amount = expandTo18Decimals(1)
        const token1Amount = expandTo18Decimals(4)

        const expectedLiquidity = expandTo18Decimals(2)
        await token0.approve(router.address, MaxUint256)
        await token1.approve(router.address, MaxUint256)
        await expect(
          router.addAndStakeLiquidity(
            token0.address,
            token1.address,
            token0Amount,
            token1Amount,
            0,
            0,
            wallet.address,
            MaxUint256,
            overrides
          )
        )
          .to.emit(token0, 'Transfer')
          .withArgs(wallet.address, pair.address, token0Amount)
          .to.emit(token1, 'Transfer')
          .withArgs(wallet.address, pair.address, token1Amount)
          .to.emit(pair, 'Transfer')
          .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
          .to.emit(pair, 'Transfer')
          .withArgs(AddressZero, lpStakerContract.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(pair, 'Sync')
          .withArgs(token0Amount, token1Amount)
          .to.emit(pair, 'Mint')
          .withArgs(router.address, token0Amount, token1Amount)
          .to.emit(pair, 'Transfer')
          .withArgs(lpStakerContract.address, stakingRewards.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(lpStakerContract, 'LPStaked')
          .withArgs(wallet.address, pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(stakingRewards, 'Staked')
          .withArgs(lpStakerContract.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))

        expect(await pair.balanceOf(stakingRewards.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      })

      it('addLiquidityETH', async () => {
        const WETHPartnerAmount = expandTo18Decimals(1)
        const ETHAmount = expandTo18Decimals(4)

        const expectedLiquidity = expandTo18Decimals(2)
        const WETHPairToken0 = await WETHPair.token0()
        await WETHPartner.approve(router.address, MaxUint256)
        await expect(
          router.addLiquidityETH(
            WETHPartner.address,
            WETHPartnerAmount,
            WETHPartnerAmount,
            ETHAmount,
            wallet.address,
            MaxUint256,
            { ...overrides, value: ETHAmount }
          )
        )
          .to.emit(WETHPair, 'Transfer')
          .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
          .to.emit(WETHPair, 'Transfer')
          .withArgs(AddressZero, wallet.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(WETHPair, 'Sync')
          .withArgs(
            WETHPairToken0 === WETHPartner.address ? WETHPartnerAmount : ETHAmount,
            WETHPairToken0 === WETHPartner.address ? ETHAmount : WETHPartnerAmount
          )
          .to.emit(WETHPair, 'Mint')
          .withArgs(
            router.address,
            WETHPairToken0 === WETHPartner.address ? WETHPartnerAmount : ETHAmount,
            WETHPairToken0 === WETHPartner.address ? ETHAmount : WETHPartnerAmount
          )

        expect(await WETHPair.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      })

      it('addAndStakeLiquidityETH', async () => {
        const WETHPartnerAmount = expandTo18Decimals(1)
        const ETHAmount = expandTo18Decimals(4)

        const expectedLiquidity = expandTo18Decimals(2)
        const WETHPairToken0 = await WETHPair.token0()
        await WETHPartner.approve(router.address, MaxUint256)
        await expect(
          router.addLiquidityETH(
            WETHPartner.address,
            WETHPartnerAmount,
            WETHPartnerAmount,
            ETHAmount,
            wallet.address,
            MaxUint256,
            { ...overrides, value: ETHAmount }
          )
        )
          .to.emit(WETHPair, 'Transfer')
          .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
          .to.emit(WETHPair, 'Transfer')
          .withArgs(AddressZero, wallet.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(WETHPair, 'Sync')
          .withArgs(
            WETHPairToken0 === WETHPartner.address ? WETHPartnerAmount : ETHAmount,
            WETHPairToken0 === WETHPartner.address ? ETHAmount : WETHPartnerAmount
          )
          .to.emit(WETHPair, 'Mint')
          .withArgs(
            router.address,
            WETHPairToken0 === WETHPartner.address ? WETHPartnerAmount : ETHAmount,
            WETHPairToken0 === WETHPartner.address ? ETHAmount : WETHPartnerAmount
          )

        expect(await WETHPair.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      })

      async function addLiquidity(token0Amount: BigNumber, token1Amount: BigNumber) {
        await token0.transfer(pair.address, token0Amount)
        await token1.transfer(pair.address, token1Amount)
        await pair.mint(wallet.address, overrides)
      }
      it('removeLiquidity', async () => {
        const token0Amount = expandTo18Decimals(1)
        const token1Amount = expandTo18Decimals(4)
        await addLiquidity(token0Amount, token1Amount)

        const expectedLiquidity = expandTo18Decimals(2)
        await pair.approve(router.address, MaxUint256)
        await expect(
          router.removeLiquidity(
            token0.address,
            token1.address,
            expectedLiquidity.sub(MINIMUM_LIQUIDITY),
            0,
            0,
            wallet.address,
            MaxUint256,
            overrides
          )
        )
          .to.emit(pair, 'Transfer')
          .withArgs(wallet.address, pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(pair, 'Transfer')
          .withArgs(pair.address, AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(token0, 'Transfer')
          .withArgs(pair.address, wallet.address, token0Amount.sub(500))
          .to.emit(token1, 'Transfer')
          .withArgs(pair.address, wallet.address, token1Amount.sub(2000))
          .to.emit(pair, 'Sync')
          .withArgs(500, 2000)
          .to.emit(pair, 'Burn')
          .withArgs(router.address, token0Amount.sub(500), token1Amount.sub(2000), wallet.address)

        expect(await pair.balanceOf(wallet.address)).to.eq(0)
        const totalSupplyToken0 = await token0.totalSupply()
        const totalSupplyToken1 = await token1.totalSupply()
        expect(await token0.balanceOf(wallet.address)).to.eq(totalSupplyToken0.sub(500))
        expect(await token1.balanceOf(wallet.address)).to.eq(totalSupplyToken1.sub(2000))
      })

      it('removeLiquidityETH', async () => {
        const WETHPartnerAmount = expandTo18Decimals(1)
        const ETHAmount = expandTo18Decimals(4)
        await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
        await WETH.deposit({ value: ETHAmount })
        await WETH.transfer(WETHPair.address, ETHAmount)
        await WETHPair.mint(wallet.address, overrides)

        const expectedLiquidity = expandTo18Decimals(2)
        const WETHPairToken0 = await WETHPair.token0()
        await WETHPair.approve(router.address, MaxUint256)
        await expect(
          router.removeLiquidityETH(
            WETHPartner.address,
            expectedLiquidity.sub(MINIMUM_LIQUIDITY),
            0,
            0,
            wallet.address,
            MaxUint256,
            overrides
          )
        )
          .to.emit(WETHPair, 'Transfer')
          .withArgs(wallet.address, WETHPair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(WETHPair, 'Transfer')
          .withArgs(WETHPair.address, AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(WETH, 'Transfer')
          .withArgs(WETHPair.address, router.address, ETHAmount.sub(2000))
          .to.emit(WETHPartner, 'Transfer')
          .withArgs(WETHPair.address, router.address, WETHPartnerAmount.sub(500))
          .to.emit(WETHPartner, 'Transfer')
          .withArgs(router.address, wallet.address, WETHPartnerAmount.sub(500))
          .to.emit(WETHPair, 'Sync')
          .withArgs(
            WETHPairToken0 === WETHPartner.address ? 500 : 2000,
            WETHPairToken0 === WETHPartner.address ? 2000 : 500
          )
          .to.emit(WETHPair, 'Burn')
          .withArgs(
            router.address,
            WETHPairToken0 === WETHPartner.address ? WETHPartnerAmount.sub(500) : ETHAmount.sub(2000),
            WETHPairToken0 === WETHPartner.address ? ETHAmount.sub(2000) : WETHPartnerAmount.sub(500),
            router.address
          )

        expect(await WETHPair.balanceOf(wallet.address)).to.eq(0)
        const totalSupplyWETHPartner = await WETHPartner.totalSupply()
        const totalSupplyWETH = await WETH.totalSupply()
        expect(await WETHPartner.balanceOf(wallet.address)).to.eq(totalSupplyWETHPartner.sub(500))
        expect(await WETH.balanceOf(wallet.address)).to.eq(totalSupplyWETH.sub(2000))
      })

      it('removeLiquidityWithPermit', async () => {
        const token0Amount = expandTo18Decimals(1)
        const token1Amount = expandTo18Decimals(4)
        await addLiquidity(token0Amount, token1Amount)

        const expectedLiquidity = expandTo18Decimals(2)

        const nonce = await pair.nonces(wallet.address)
        const digest = await getApprovalDigest(
          pair,
          { owner: wallet.address, spender: router.address, value: expectedLiquidity.sub(MINIMUM_LIQUIDITY) },
          nonce,
          MaxUint256
        )

        const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

        await router.removeLiquidityWithPermit(
          token0.address,
          token1.address,
          expectedLiquidity.sub(MINIMUM_LIQUIDITY),
          0,
          0,
          wallet.address,
          MaxUint256,
          false,
          v,
          r,
          s,
          overrides
        )
      })

      it('removeLiquidityETHWithPermit', async () => {
        const WETHPartnerAmount = expandTo18Decimals(1)
        const ETHAmount = expandTo18Decimals(4)
        await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount)
        await WETH.deposit({ value: ETHAmount })
        await WETH.transfer(WETHPair.address, ETHAmount)
        await WETHPair.mint(wallet.address, overrides)

        const expectedLiquidity = expandTo18Decimals(2)

        const nonce = await WETHPair.nonces(wallet.address)
        const digest = await getApprovalDigest(
          WETHPair,
          { owner: wallet.address, spender: router.address, value: expectedLiquidity.sub(MINIMUM_LIQUIDITY) },
          nonce,
          MaxUint256
        )

        const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

        await router.removeLiquidityETHWithPermit(
          WETHPartner.address,
          expectedLiquidity.sub(MINIMUM_LIQUIDITY),
          0,
          0,
          wallet.address,
          MaxUint256,
          false,
          v,
          r,
          s,
          overrides
        )
      })
    })
  }
})
