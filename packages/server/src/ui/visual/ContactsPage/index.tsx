import React from 'react';
import NavBar from '../NavBar';
import HeroBar, {HeroBarFooter} from '../HeroBar';
import {HeroBarBanner} from '../HeroBar';
import Contacts from './contacts';

export default function LandingPage() {
  return (
    <>
      <div className="pb-6 pt-16">
        <NavBar></NavBar>
      </div>
      <HeroBar />
      <HeroBarBanner>
        We want you to love Rolling Versions and to use it on all your projects.
        So if you have any queries or suggestions then do contact us. You can
        contact us via email or twitter and, of course, can raise pull requests
        and issues on github.
      </HeroBarBanner>
      <div className="py-16">
        <Contacts />
      </div>
      <HeroBarFooter />
    </>
  );
}
