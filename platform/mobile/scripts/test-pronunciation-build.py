"""Meaningful source/phoneme regression cases. Uses build-time dependencies."""
from pathlib import Path
import runpy, unittest
build=runpy.run_path(str(Path(__file__).with_name('build-pronunciation.py')))

class PronunciationBuildTests(unittest.TestCase):
    def test_syllable_onset_stress_becomes_vowel_stress(self):
        self.assertEqual(build['phonemes']('/əˈkwɪvəkəl/'),'əkwˈɪvəkəl')
        self.assertEqual(build['phonemes']('/ˈɹaɪt͡ʃəs/'),'ɹˈaɪtʃəs')
        self.assertEqual(build['phonemes']('/ˌæb.əˈɹeɪ.ʃn̩/'),'ˌæbəɹˈeɪʃən')
    def test_linking_r_is_not_added_to_isolated_british_word(self):
        self.assertEqual(build['phonemes']('/ˈkɑː(r)/'),'kˈɑː')
        self.assertEqual(build['phonemes']('/ˈkɑː(r)/','us'),'kˈɑːɹ')
    def test_optional_schwa_and_nonsyllabic_marker(self):
        self.assertEqual(build['phonemes']('/ˈeɪ̯lm(ə)nt/'),'ˈeɪlmənt')
    def test_wrong_accent_and_obsolete_readings_are_not_used(self):
        entries=[{'pos':'adj','sounds':[{'ipa':'/a/','tags':['Australia']},{'ipa':'/b/','tags':['US','obsolete']},{'ipa':'/c/','tags':['US']},{'ipa':'/d/','tags':['UK']}]}]
        self.assertEqual(build['candidates'](entries,'gb')[0][1]['ipa'],'/d/')
        self.assertEqual(build['candidates'](entries,'us')[0][1]['ipa'],'/c/')
    def test_accent_specific_ipa_precedes_shared_reading(self):
        entries=[{'pos':'verb','sounds':[{'ipa':'/a/'},{'ipa':'/b/','tags':['US']}]}]
        self.assertEqual(build['candidates'](entries,'us')[0][1]['ipa'],'/b/')
        self.assertEqual(build['candidates'](entries,'gb')[0][1]['ipa'],'/a/')
    def test_unlabelled_regional_vowels_do_not_claim_both_accents(self):
        british=[{'pos':'noun','sounds':[{'ipa':'/kɒt/'},{'ipa':'/kəʊt/'}]}]
        american=[{'pos':'noun','sounds':[{'ipa':'/bɝd/'}]}]
        self.assertEqual(build['candidates'](british,'us'),[])
        self.assertEqual(build['candidates'](american,'gb'),[])

if __name__=='__main__': unittest.main()
